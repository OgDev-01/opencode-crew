import type { PluginInput } from "@opencode-ai/plugin"
import type {
  BackgroundTask,
} from "./types"
import type { BackgroundTaskConfig } from "@/config/schema"
import { normalizeSDKResponse, log } from "@/shared"
import { SessionCategoryRegistry } from "@/shared/session/session-category-registry"
import {
  shouldRetryError,
  hasMoreFallbacks,
} from "@/shared/model/model-error-classifier"
import { subagentSessions } from "../claude-code-session-state" // EXCEPTION: background-agent orchestrates session state
import { getTaskToastManager } from "../task-toast-manager" // EXCEPTION: background-agent orchestrates task-toast notifications
import {
  extractErrorMessage,
  extractErrorName,
  getSessionErrorMessage,
} from "./error-classifier"
import { handleSessionIdleBackgroundEvent } from "./session-idle-event-handler"
import {
  checkAndInterruptStaleTasks,
  pruneStaleTasksAndNotifications,
} from "./task-poller"
import { TaskStateManager } from "./state"
import { TaskNotificationManager } from "./notification-manager"
import { TaskSpawner } from "./spawner"
import { TaskHistory } from "./task-history"
import type { ConcurrencyManager } from "./concurrency"

type OpencodeClient = PluginInput["client"]

interface MessagePartInfo {
  sessionID?: string
  type?: string
  tool?: string
}

interface EventProperties {
  sessionID?: string
  info?: { id?: string }
  [key: string]: unknown
}

interface Event {
  type: string
  properties?: EventProperties
}

interface Todo {
  content: string
  status: string
  priority: string
  id: string
}

interface TaskLifecycleManagerDeps {
  stateManager: TaskStateManager
  taskSpawner: TaskSpawner
  notificationManager: TaskNotificationManager
  taskHistory: TaskHistory
  client: OpencodeClient
  concurrencyManager: ConcurrencyManager
  config?: BackgroundTaskConfig
  idleDeferralTimers: Map<string, ReturnType<typeof setTimeout>>
  startPolling: () => void
  stopPolling: () => void
  enqueueNotificationForParent: (
    parentSessionID: string | undefined,
    operation: () => Promise<void>
  ) => Promise<void>
  notifyParentSession: (task: BackgroundTask) => Promise<void>
  tryFallbackRetry: (
    task: BackgroundTask,
    errorInfo: { name?: string; message?: string },
    source: string,
  ) => boolean
}

export class TaskLifecycleManager {
  private pollingInFlight = false

  constructor(private deps: TaskLifecycleManagerDeps) {}

  async trackTask(input: {
    taskId: string
    sessionID: string
    parentSessionID: string
    description: string
    agent?: string
    parentAgent?: string
    concurrencyKey?: string
  }): Promise<BackgroundTask> {
    const existingTask = this.deps.stateManager.tasks.get(input.taskId)
    if (existingTask) {
      const parentChanged = input.parentSessionID !== existingTask.parentSessionID
      if (parentChanged) {
        this.cleanupPendingByParent(existingTask)
        existingTask.parentSessionID = input.parentSessionID
      }
      if (input.parentAgent !== undefined) {
        existingTask.parentAgent = input.parentAgent
      }
      if (!existingTask.concurrencyGroup) {
        existingTask.concurrencyGroup = input.concurrencyKey ?? existingTask.agent
      }

      if (existingTask.sessionID) {
        subagentSessions.add(existingTask.sessionID)
      }
      this.deps.startPolling()

      if (existingTask.status === "pending" || existingTask.status === "running") {
        const pending = this.deps.stateManager.pendingByParent.get(input.parentSessionID) ?? new Set()
        pending.add(existingTask.id)
        this.deps.stateManager.pendingByParent.set(input.parentSessionID, pending)
      } else if (!parentChanged) {
        this.cleanupPendingByParent(existingTask)
      }

      log("[background-agent] External task already registered:", { taskId: existingTask.id, sessionID: existingTask.sessionID, status: existingTask.status })

      return existingTask
    }

    const concurrencyGroup = input.concurrencyKey ?? input.agent ?? "task"

    if (input.concurrencyKey) {
      await this.deps.concurrencyManager.acquire(input.concurrencyKey)
    }

    const task: BackgroundTask = {
      id: input.taskId,
      sessionID: input.sessionID,
      parentSessionID: input.parentSessionID,
      parentMessageID: "",
      description: input.description,
      prompt: "",
      agent: input.agent || "task",
      status: "running",
      startedAt: new Date(),
      progress: {
        toolCalls: 0,
        lastUpdate: new Date(),
      },
      parentAgent: input.parentAgent,
      concurrencyKey: input.concurrencyKey,
      concurrencyGroup,
    }

    this.deps.stateManager.tasks.set(task.id, task)
    subagentSessions.add(input.sessionID)
    this.deps.startPolling()
    this.deps.taskHistory.record(input.parentSessionID, { id: task.id, sessionID: input.sessionID, agent: input.agent || "task", description: input.description, status: "running", startedAt: task.startedAt })

    if (input.parentSessionID) {
      const pending = this.deps.stateManager.pendingByParent.get(input.parentSessionID) ?? new Set()
      pending.add(task.id)
      this.deps.stateManager.pendingByParent.set(input.parentSessionID, pending)
    }

    log("[background-agent] Registered external task:", { taskId: task.id, sessionID: input.sessionID })

    return task
  }

  handleEvent(event: Event): void {
    const props = event.properties

    if (event.type === "message.updated") {
      const info = props?.info
      if (!info || typeof info !== "object") return

      const sessionID = (info as Record<string, unknown>)["sessionID"]
      const role = (info as Record<string, unknown>)["role"]
      if (typeof sessionID !== "string" || role !== "assistant") return

      const task = this.deps.stateManager.findBySession(sessionID)
      if (!task || task.status !== "running") return

      const assistantError = (info as Record<string, unknown>)["error"]
      if (!assistantError) return

      const errorInfo = {
        name: extractErrorName(assistantError),
        message: extractErrorMessage(assistantError),
      }
      this.deps.tryFallbackRetry(task, errorInfo, "message.updated")
    }

    if (event.type === "message.part.updated" || event.type === "message.part.delta") {
      if (!props || typeof props !== "object" || !("sessionID" in props)) return
      const partInfo = props as unknown as MessagePartInfo
      const sessionID = partInfo?.sessionID
      if (!sessionID) return

      const task = this.deps.stateManager.findBySession(sessionID)
      if (!task) return

      const existingTimer = this.deps.idleDeferralTimers.get(task.id)
      if (existingTimer) {
        clearTimeout(existingTimer)
        this.deps.idleDeferralTimers.delete(task.id)
      }

      if (!task.progress) {
        task.progress = {
          toolCalls: 0,
          lastUpdate: new Date(),
        }
      }
      task.progress.lastUpdate = new Date()

      if (partInfo?.type === "tool" || partInfo?.tool) {
        task.progress.toolCalls += 1
        task.progress.lastTool = partInfo.tool
      }
    }

    if (event.type === "session.idle") {
      if (!props || typeof props !== "object") return
      handleSessionIdleBackgroundEvent({
        properties: props as Record<string, unknown>,
        findBySession: (id) => this.deps.stateManager.findBySession(id),
        idleDeferralTimers: this.deps.idleDeferralTimers,
        validateSessionHasOutput: (id) => this.validateSessionHasOutput(id),
        checkSessionTodos: (id) => this.checkSessionTodos(id),
        tryCompleteTask: (task, source) => this.tryCompleteTask(task, source),
        emitIdleEvent: (sessionID) => this.handleEvent({ type: "session.idle", properties: { sessionID } }),
      })
    }

    if (event.type === "session.error") {
      const sessionID = typeof props?.sessionID === "string" ? props.sessionID : undefined
      if (!sessionID) return

      const task = this.deps.stateManager.findBySession(sessionID)
      if (!task || task.status !== "running") return

      const errorObj = props?.error as { name?: string; message?: string } | undefined
      const errorName = errorObj?.name
      const errorMessage = props ? getSessionErrorMessage(props) : undefined

      const errorInfo = { name: errorName, message: errorMessage }
      if (this.deps.tryFallbackRetry(task, errorInfo, "session.error")) return

      const errorMsg = errorMessage ?? "Session error"
      const canRetry =
        shouldRetryError(errorInfo) &&
        !!task.fallbackChain &&
        hasMoreFallbacks(task.fallbackChain, task.attemptCount ?? 0)
      log("[background-agent] Session error - no retry:", {
        taskId: task.id,
        errorName,
        errorMessage: errorMsg?.slice(0, 100),
        hasFallbackChain: !!task.fallbackChain,
        canRetry,
      })

      task.status = "error"
      task.error = errorMsg
      task.completedAt = new Date()
      this.deps.taskHistory.record(task.parentSessionID, { id: task.id, sessionID: task.sessionID, agent: task.agent, description: task.description, status: "error", category: task.category, startedAt: task.startedAt, completedAt: task.completedAt })

      if (task.concurrencyKey) {
        this.deps.concurrencyManager.release(task.concurrencyKey)
        task.concurrencyKey = undefined
      }

      const completionTimer = this.deps.stateManager.completionTimers.get(task.id)
      if (completionTimer) {
        clearTimeout(completionTimer)
        this.deps.stateManager.completionTimers.delete(task.id)
      }

      const idleTimer = this.deps.idleDeferralTimers.get(task.id)
      if (idleTimer) {
        clearTimeout(idleTimer)
        this.deps.idleDeferralTimers.delete(task.id)
      }

      this.cleanupPendingByParent(task)
      this.deps.stateManager.tasks.delete(task.id)
      this.deps.notificationManager.clearNotificationsForTask(task.id)
      const toastManager = getTaskToastManager()
      if (toastManager) {
        toastManager.removeTask(task.id)
      }
      if (task.sessionID) {
        subagentSessions.delete(task.sessionID)
      }
    }

    if (event.type === "session.deleted") {
      const info = props?.info
      if (!info || typeof info.id !== "string") return
      const sessionID = info.id

      const tasksToCancel = new Map<string, BackgroundTask>()
      const directTask = this.deps.stateManager.findBySession(sessionID)
      if (directTask) {
        tasksToCancel.set(directTask.id, directTask)
      }
      for (const descendant of this.deps.stateManager.getAllDescendantTasks(sessionID)) {
        tasksToCancel.set(descendant.id, descendant)
      }

      this.deps.notificationManager.clearPendingNotificationsForSession(sessionID)

      if (tasksToCancel.size === 0) return

      for (const task of tasksToCancel.values()) {
        if (task.status === "running" || task.status === "pending") {
          void this.cancelTask(task.id, {
            source: "session.deleted",
            reason: "Session deleted",
            skipNotification: true,
          }).catch(err => {
            log("[background-agent] Failed to cancel task on session.deleted:", { taskId: task.id, error: err })
          })
        }

        const existingTimer = this.deps.stateManager.completionTimers.get(task.id)
        if (existingTimer) {
          clearTimeout(existingTimer)
          this.deps.stateManager.completionTimers.delete(task.id)
        }

        const idleTimer = this.deps.idleDeferralTimers.get(task.id)
        if (idleTimer) {
          clearTimeout(idleTimer)
          this.deps.idleDeferralTimers.delete(task.id)
        }

        this.cleanupPendingByParent(task)
        this.deps.stateManager.tasks.delete(task.id)
        this.deps.notificationManager.clearNotificationsForTask(task.id)
        const toastManager = getTaskToastManager()
        if (toastManager) {
          toastManager.removeTask(task.id)
        }
        if (task.sessionID) {
          subagentSessions.delete(task.sessionID)
        }
      }

      for (const task of tasksToCancel.values()) {
        if (task.parentSessionID) {
          this.deps.notificationManager.clearPendingNotificationsForSession(task.parentSessionID)
        }
      }

      SessionCategoryRegistry.remove(sessionID)
    }

    if (event.type === "session.status") {
      const sessionID = props?.sessionID as string | undefined
      const status = props?.status as { type?: string; message?: string } | undefined
      if (!sessionID || status?.type !== "retry") return

      const task = this.deps.stateManager.findBySession(sessionID)
      if (!task || task.status !== "running") return

      const errorMessage = typeof status.message === "string" ? status.message : undefined
      const errorInfo = { name: "SessionRetry", message: errorMessage }
      this.deps.tryFallbackRetry(task, errorInfo, "session.status")
    }
  }

  async cancelTask(
    taskId: string,
    options?: { source?: string; reason?: string; abortSession?: boolean; skipNotification?: boolean }
  ): Promise<boolean> {
    const task = this.deps.stateManager.tasks.get(taskId)
    if (!task || (task.status !== "running" && task.status !== "pending")) {
      return false
    }

    const source = options?.source ?? "cancel"
    const abortSession = options?.abortSession !== false
    const reason = options?.reason

    if (task.status === "pending") {
      this.deps.taskSpawner.removePendingTaskFromQueue(task)
      const key = this.deps.stateManager.getConcurrencyKeyFromTask(task)
      log("[background-agent] Cancelled pending task:", { taskId, key })
    }

    task.status = "cancelled"
    task.completedAt = new Date()
    if (reason) {
      task.error = reason
    }
    this.deps.taskHistory.record(task.parentSessionID, { id: task.id, sessionID: task.sessionID, agent: task.agent, description: task.description, status: "cancelled", category: task.category, startedAt: task.startedAt, completedAt: task.completedAt })

    if (task.concurrencyKey) {
      this.deps.concurrencyManager.release(task.concurrencyKey)
      task.concurrencyKey = undefined
    }

    const existingTimer = this.deps.stateManager.completionTimers.get(task.id)
    if (existingTimer) {
      clearTimeout(existingTimer)
      this.deps.stateManager.completionTimers.delete(task.id)
    }

    const idleTimer = this.deps.idleDeferralTimers.get(task.id)
    if (idleTimer) {
      clearTimeout(idleTimer)
      this.deps.idleDeferralTimers.delete(task.id)
    }

    this.cleanupPendingByParent(task)

    if (abortSession && task.sessionID) {
      this.deps.client.session.abort({
        path: { id: task.sessionID },
      }).catch(() => {})

      SessionCategoryRegistry.remove(task.sessionID)
    }

    if (options?.skipNotification) {
      const toastManager = getTaskToastManager()
      if (toastManager) {
        toastManager.removeTask(task.id)
      }
      log(`[background-agent] Task cancelled via ${source} (notification skipped):`, task.id)
      return true
    }

    this.deps.notificationManager.markForNotification(task)

    try {
      await this.deps.enqueueNotificationForParent(task.parentSessionID, () => this.deps.notifyParentSession(task))
      log(`[background-agent] Task cancelled via ${source}:`, task.id)
    } catch (err) {
      log("[background-agent] Error in notifyParentSession for cancelled task:", { taskId: task.id, error: err })
    }

    return true
  }

  cancelPendingTask(taskId: string): boolean {
    const task = this.deps.stateManager.tasks.get(taskId)
    if (!task || task.status !== "pending") {
      return false
    }

    void this.cancelTask(taskId, { source: "cancelPendingTask", abortSession: false })
    return true
  }

  async pollRunningTasks(): Promise<void> {
    if (this.pollingInFlight) return
    this.pollingInFlight = true
    try {
      this.pruneStaleTasksAndNotifications()

      const statusResult = await this.deps.client.session.status()
      const allStatuses = normalizeSDKResponse(statusResult, {} as Record<string, { type: string }>)

      await this.checkAndInterruptStaleTasks(allStatuses)

      for (const task of this.deps.stateManager.tasks.values()) {
        if (task.status !== "running") continue

        const sessionID = task.sessionID
        if (!sessionID) continue

        try {
          const sessionStatus = allStatuses[sessionID]

          if (sessionStatus?.type === "idle") {
            const hasValidOutput = await this.validateSessionHasOutput(sessionID)
            if (!hasValidOutput) {
              log("[background-agent] Polling idle but no valid output yet, waiting:", task.id)
              continue
            }

            if (task.status !== "running") continue

            const hasIncompleteTodos = await this.checkSessionTodos(sessionID)
            if (hasIncompleteTodos) {
              log("[background-agent] Task has incomplete todos via polling, waiting:", task.id)
              continue
            }

            await this.tryCompleteTask(task, "polling (idle status)")
            continue
          }

          if (sessionStatus?.type === "retry") {
            const retryMessage = typeof (sessionStatus as { message?: string }).message === "string"
              ? (sessionStatus as { message?: string }).message
              : undefined
            const errorInfo = { name: "SessionRetry", message: retryMessage }
            if (this.deps.tryFallbackRetry(task, errorInfo, "polling:session.status")) {
              continue
            }
          }

          log("[background-agent] Session still running, relying on event-based progress:", {
            taskId: task.id,
            sessionID,
            sessionStatus: sessionStatus?.type ?? "not_in_status",
            toolCalls: task.progress?.toolCalls ?? 0,
          })
        } catch (error) {
          log("[background-agent] Poll error for task:", { taskId: task.id, error })
        }
      }

      if (!this.deps.stateManager.hasRunningTasks()) {
        this.deps.stopPolling()
      }
    } finally {
      this.pollingInFlight = false
    }
  }

  private async checkSessionTodos(sessionID: string): Promise<boolean> {
    try {
      const response = await this.deps.client.session.todo({
        path: { id: sessionID },
      })
      const todos = normalizeSDKResponse(response, [] as Todo[], { preferResponseOnMissingData: true })
      if (!todos || todos.length === 0) return false

      const incomplete = todos.filter(
        (t) => t.status !== "completed" && t.status !== "cancelled"
      )
      return incomplete.length > 0
    } catch {
      return false
    }
  }

  private async validateSessionHasOutput(sessionID: string): Promise<boolean> {
    try {
      const response = await this.deps.client.session.messages({
        path: { id: sessionID },
      })

      const messages = normalizeSDKResponse(response, [] as Array<{
        info?: { role?: string }
        parts?: Array<{
          type?: string
          text?: string
          content?: string | unknown[]
        }>
      }>, { preferResponseOnMissingData: true })

      const hasAssistantOrToolMessage = messages.some(
        (m) => m.info?.role === "assistant" || m.info?.role === "tool"
      )

      if (!hasAssistantOrToolMessage) {
        log("[background-agent] No assistant/tool messages found in session:", sessionID)
        return false
      }

      const hasContent = messages.some((m) => {
        if (m.info?.role !== "assistant" && m.info?.role !== "tool") return false
        const parts = m.parts ?? []
        return parts.some((p) =>
          (p.type === "text" && !!p.text && p.text.trim().length > 0) ||
          (p.type === "reasoning" && !!p.text && p.text.trim().length > 0) ||
          p.type === "tool" ||
          (p.type === "tool_result" && !!p.content &&
            (typeof p.content === "string" ? p.content.trim().length > 0 : p.content.length > 0))
        )
      })

      if (!hasContent) {
        log("[background-agent] Messages exist but no content found in session:", sessionID)
        return false
      }

      return true
    } catch (error) {
      log("[background-agent] Error validating session output:", error)
      return true
    }
  }

  public async tryCompleteTask(task: BackgroundTask, source: string): Promise<boolean> {
    if (task.status !== "running") {
      log("[background-agent] Task already completed, skipping:", { taskId: task.id, status: task.status, source })
      return false
    }

    task.status = "completed"
    task.completedAt = new Date()
    this.deps.taskHistory.record(task.parentSessionID, { id: task.id, sessionID: task.sessionID, agent: task.agent, description: task.description, status: "completed", category: task.category, startedAt: task.startedAt, completedAt: task.completedAt })

    if (task.concurrencyKey) {
      this.deps.concurrencyManager.release(task.concurrencyKey)
      task.concurrencyKey = undefined
    }

    this.deps.notificationManager.markForNotification(task)

    this.cleanupPendingByParent(task)

    const idleTimer = this.deps.idleDeferralTimers.get(task.id)
    if (idleTimer) {
      clearTimeout(idleTimer)
      this.deps.idleDeferralTimers.delete(task.id)
    }

    if (task.sessionID) {
      this.deps.client.session.abort({
        path: { id: task.sessionID },
      }).catch(() => {})

      SessionCategoryRegistry.remove(task.sessionID)
    }

    try {
      await this.deps.enqueueNotificationForParent(task.parentSessionID, () => this.deps.notifyParentSession(task))
      log(`[background-agent] Task completed via ${source}:`, task.id)
    } catch (err) {
      log("[background-agent] Error in notifyParentSession:", { taskId: task.id, error: err })
    }

    return true
  }

  private cleanupPendingByParent(task: BackgroundTask): void {
    this.deps.stateManager.cleanupPendingByParent(task)
  }

  public pruneStaleTasksAndNotifications(): void {
    pruneStaleTasksAndNotifications({
      tasks: this.deps.stateManager.tasks,
      notifications: this.deps.stateManager.notifications,
      onTaskPruned: (taskId, task, errorMessage) => {
        const wasPending = task.status === "pending"
        log("[background-agent] Pruning stale task:", { taskId, status: task.status, age: Math.round(((wasPending ? task.queuedAt?.getTime() : task.startedAt?.getTime()) ? (Date.now() - (wasPending ? task.queuedAt!.getTime() : task.startedAt!.getTime())) : 0) / 1000) + "s" })
        task.status = "error"
        task.error = errorMessage
        task.completedAt = new Date()
        if (task.concurrencyKey) {
          this.deps.concurrencyManager.release(task.concurrencyKey)
          task.concurrencyKey = undefined
        }
        this.cleanupPendingByParent(task)
        if (wasPending) {
          this.deps.taskSpawner.removePendingTaskFromQueue(task)
        }
        this.deps.notificationManager.clearNotificationsForTask(taskId)
        const toastManager = getTaskToastManager()
        if (toastManager) {
          toastManager.removeTask(taskId)
        }
        this.deps.stateManager.tasks.delete(taskId)
        if (task.sessionID) {
          subagentSessions.delete(task.sessionID)
          SessionCategoryRegistry.remove(task.sessionID)
        }
      },
    })
  }

  public async checkAndInterruptStaleTasks(
    allStatuses: Record<string, { type: string }> = {},
  ): Promise<void> {
    await checkAndInterruptStaleTasks({
      tasks: this.deps.stateManager.tasks.values(),
      client: this.deps.client,
      config: this.deps.config,
      concurrencyManager: this.deps.concurrencyManager,
      notifyParentSession: (task) => this.deps.enqueueNotificationForParent(task.parentSessionID, () => this.deps.notifyParentSession(task)),
      sessionStatuses: allStatuses,
    })
  }
}
