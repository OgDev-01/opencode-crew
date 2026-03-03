import type { PluginInput } from "@opencode-ai/plugin"
import type {
  BackgroundTask,
  LaunchInput,
  ResumeInput,
} from "./types"
import { TaskHistory } from "./task-history"
import { log } from "@/shared"
import { ConcurrencyManager } from "./concurrency"
import type { BackgroundTaskConfig, TmuxConfig } from "@/config/schema"
import {
  POLLING_INTERVAL_MS,
  type QueueItem,
} from "./constants"
import { subagentSessions } from "../claude-code-session-state" // EXCEPTION: background-agent orchestrates session state
import { registerManagerForCleanup, unregisterManagerForCleanup } from "./process-cleanup"
import { TaskStateManager } from "./state"
import { TaskNotificationManager } from "./notification-manager"
import { TaskSpawner } from "./spawner"
import { tryFallbackRetry } from "./fallback-retry-handler"
import { TaskLifecycleManager } from "./task-lifecycle-manager"

type OpencodeClient = PluginInput["client"]

interface EventProperties {
  sessionID?: string
  info?: { id?: string }
  [key: string]: unknown
}

interface Event {
  type: string
  properties?: EventProperties
}

export interface SubagentSessionCreatedEvent {
  sessionID: string
  parentID: string
  title: string
}

export type OnSubagentSessionCreated = (event: SubagentSessionCreatedEvent) => Promise<void>

export class BackgroundManager {
  private stateManager: TaskStateManager

  private tasks: Map<string, BackgroundTask>
  private notifications: Map<string, BackgroundTask[]>
  private pendingNotifications: Map<string, string[]>
  private pendingByParent: Map<string, Set<string>>
  private client: OpencodeClient
  private directory: string
  private pollingInterval?: ReturnType<typeof setInterval>
  private concurrencyManager: ConcurrencyManager
  private shutdownTriggered = false
  private config?: BackgroundTaskConfig
  private tmuxEnabled: boolean
  private onSubagentSessionCreated?: OnSubagentSessionCreated
  private onShutdown?: () => void

  private queuesByKey: Map<string, QueueItem[]>
  private processingKeys: Set<string>
  private completionTimers: Map<string, ReturnType<typeof setTimeout>>
  private idleDeferralTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private enableParentSessionNotifications: boolean
  private notificationManager: TaskNotificationManager
  private taskSpawner: TaskSpawner
  private lifecycleManager: TaskLifecycleManager
  readonly taskHistory = new TaskHistory()

  constructor(
    ctx: PluginInput,
    config?: BackgroundTaskConfig,
    options?: {
      tmuxConfig?: TmuxConfig
      onSubagentSessionCreated?: OnSubagentSessionCreated
      onShutdown?: () => void
      enableParentSessionNotifications?: boolean
    }
  ) {
    this.stateManager = new TaskStateManager()
    this.tasks = this.stateManager.tasks
    this.notifications = this.stateManager.notifications
    this.pendingNotifications = new Map()
    this.pendingByParent = this.stateManager.pendingByParent
    this.queuesByKey = this.stateManager.queuesByKey
    this.processingKeys = this.stateManager.processingKeys
    this.completionTimers = this.stateManager.completionTimers
    this.client = ctx.client
    this.directory = ctx.directory
    this.concurrencyManager = new ConcurrencyManager(config)
    this.config = config
    this.tmuxEnabled = options?.tmuxConfig?.enabled ?? false
    this.onSubagentSessionCreated = options?.onSubagentSessionCreated
    this.onShutdown = options?.onShutdown
    this.enableParentSessionNotifications = options?.enableParentSessionNotifications ?? true
    this.notificationManager = new TaskNotificationManager(this.stateManager, ctx, {
      enableParentSessionNotifications: this.enableParentSessionNotifications,
      pendingNotifications: this.pendingNotifications,
    })
    this.taskSpawner = new TaskSpawner(this.stateManager, {
      client: this.client,
      directory: this.directory,
      concurrencyManager: this.concurrencyManager,
      tmuxEnabled: this.tmuxEnabled,
      onSubagentSessionCreated: this.onSubagentSessionCreated,
    }, {
      taskHistory: this.taskHistory,
      processKey: (key) => this.processKey(key),
      startPolling: () => this.startPolling(),
      markForNotification: (task) => this.markForNotification(task),
      cleanupPendingByParent: (task) => this.cleanupPendingByParent(task),
      enqueueNotificationForParent: (parentSessionID, operation) => this.enqueueNotificationForParent(parentSessionID, operation),
      notifyParentSession: (task) => this.notifyParentSession(task),
    })
    this.lifecycleManager = new TaskLifecycleManager({
      stateManager: this.stateManager,
      taskSpawner: this.taskSpawner,
      notificationManager: this.notificationManager,
      taskHistory: this.taskHistory,
      client: this.client,
      concurrencyManager: this.concurrencyManager,
      config: this.config,
      idleDeferralTimers: this.idleDeferralTimers,
      startPolling: () => this.startPolling(),
      stopPolling: () => this.stopPolling(),
      enqueueNotificationForParent: (parentSessionID, operation) => this.enqueueNotificationForParent(parentSessionID, operation),
      notifyParentSession: (task) => this.notifyParentSession(task),
      tryFallbackRetry: (task, errorInfo, source) => this.tryFallbackRetry(task, errorInfo, source),
    })
    this.registerProcessCleanup()
  }

  async launch(input: LaunchInput): Promise<BackgroundTask> {
    return this.taskSpawner.launch(input)
  }

  private async processKey(key: string): Promise<void> {
    await this.taskSpawner.processKey(key, (item) => this.startTask(item))
  }

  private async startTask(item: QueueItem): Promise<void> {
    await this.taskSpawner.startTask(item)
  }

  getTask(id: string): BackgroundTask | undefined {
    return this.stateManager.getTask(id)
  }

  getTasksByParentSession(sessionID: string): BackgroundTask[] {
    return this.stateManager.getTasksByParentSession(sessionID)
  }

  getAllDescendantTasks(sessionID: string): BackgroundTask[] {
    return this.stateManager.getAllDescendantTasks(sessionID)
  }

  findBySession(sessionID: string): BackgroundTask | undefined {
    return this.stateManager.findBySession(sessionID)
  }

  async trackTask(input: {
    taskId: string
    sessionID: string
    parentSessionID: string
    description: string
    agent?: string
    parentAgent?: string
    concurrencyKey?: string
  }): Promise<BackgroundTask> {
    return this.lifecycleManager.trackTask(input)
  }

  async resume(input: ResumeInput): Promise<BackgroundTask> {
    return this.taskSpawner.resume(input)
  }

  handleEvent(event: Event): void {
    this.lifecycleManager.handleEvent(event)
  }

  private tryFallbackRetry(
    task: BackgroundTask,
    errorInfo: { name?: string; message?: string },
    source: string,
  ): boolean {
    const previousSessionID = task.sessionID
    const result = tryFallbackRetry({
      task,
      errorInfo,
      source,
      concurrencyManager: this.concurrencyManager,
      client: this.client,
      idleDeferralTimers: this.idleDeferralTimers,
      queuesByKey: this.queuesByKey,
      processKey: async (key: string) => {
        setTimeout(() => {
          void this.processKey(key)
        }, 0)
      },
    })
    if (result && previousSessionID) {
      subagentSessions.delete(previousSessionID)
    }
    return result
  }

  markForNotification(task: BackgroundTask): void {
    this.notificationManager.markForNotification(task)
  }

  getPendingNotifications(sessionID: string): BackgroundTask[] {
    return this.notificationManager.getPendingNotifications(sessionID)
  }

  clearNotifications(sessionID: string): void {
    this.notificationManager.clearNotifications(sessionID)
  }

  queuePendingNotification(sessionID: string | undefined, notification: string): void {
    this.notificationManager.queuePendingNotification(sessionID, notification)
  }

  injectPendingNotificationsIntoChatMessage(output: { parts: Array<{ type: string; text?: string; [key: string]: unknown }> }, sessionID: string): void {
    this.notificationManager.injectPendingNotificationsIntoChatMessage(output, sessionID)
  }

  private cleanupPendingByParent(task: BackgroundTask): void {
    this.stateManager.cleanupPendingByParent(task)
  }

  async cancelTask(
    taskId: string,
    options?: { source?: string; reason?: string; abortSession?: boolean; skipNotification?: boolean }
  ): Promise<boolean> {
    return this.lifecycleManager.cancelTask(taskId, options)
  }

  cancelPendingTask(taskId: string): boolean {
    return this.lifecycleManager.cancelPendingTask(taskId)
  }

  private startPolling(): void {
    if (this.pollingInterval) return

    this.pollingInterval = setInterval(() => {
      void this.pollRunningTasks()
    }, POLLING_INTERVAL_MS)
    this.pollingInterval.unref()
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = undefined
    }
  }

  private registerProcessCleanup(): void {
    registerManagerForCleanup(this)
  }

  private unregisterProcessCleanup(): void {
    unregisterManagerForCleanup(this)
  }

  getRunningTasks(): BackgroundTask[] {
    return this.stateManager.getRunningTasks()
  }

  getNonRunningTasks(): BackgroundTask[] {
    return this.stateManager.getNonRunningTasks()
  }

  private async notifyParentSession(task: BackgroundTask): Promise<void> {
    return this.notificationManager.notifyTaskCompletion(task)
  }

  private async tryCompleteTask(task: BackgroundTask, source: string): Promise<boolean> {
    return this.lifecycleManager.tryCompleteTask(task, source)
  }

  private pruneStaleTasksAndNotifications(): void {
    this.lifecycleManager.pruneStaleTasksAndNotifications()
  }

  private async checkAndInterruptStaleTasks(
    allStatuses: Record<string, { type: string }> = {},
  ): Promise<void> {
    await this.lifecycleManager.checkAndInterruptStaleTasks(allStatuses)
  }

  private async pollRunningTasks(): Promise<void> {
    await this.lifecycleManager.pollRunningTasks()
  }

  shutdown(): void {
    if (this.shutdownTriggered) return
    this.shutdownTriggered = true
    log("[background-agent] Shutting down BackgroundManager")
    this.stopPolling()

    for (const task of this.tasks.values()) {
      if (task.status === "running" && task.sessionID) {
        this.client.session.abort({
          path: { id: task.sessionID },
        }).catch(() => {})
      }
    }

    if (this.onShutdown) {
      try {
        this.onShutdown()
      } catch (error) {
        log("[background-agent] Error in onShutdown callback:", error)
      }
    }

    for (const task of this.tasks.values()) {
      if (task.concurrencyKey) {
        this.concurrencyManager.release(task.concurrencyKey)
        task.concurrencyKey = undefined
      }
    }

    for (const timer of this.completionTimers.values()) {
      clearTimeout(timer)
    }
    this.completionTimers.clear()

    for (const timer of this.idleDeferralTimers.values()) {
      clearTimeout(timer)
    }
    this.idleDeferralTimers.clear()

    this.concurrencyManager.clear()
    this.tasks.clear()
    this.notifications.clear()
    this.pendingByParent.clear()
    this.notificationManager.shutdown()
    this.queuesByKey.clear()
    this.processingKeys.clear()
    this.unregisterProcessCleanup()
    log("[background-agent] Shutdown complete")
  }

  private enqueueNotificationForParent(
    parentSessionID: string | undefined,
    operation: () => Promise<void>
  ): Promise<void> {
    return this.notificationManager.enqueueNotificationForParent(parentSessionID, operation)
  }
}
