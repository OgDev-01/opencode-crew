import type { PluginInput } from "@opencode-ai/plugin"
import { join } from "node:path"
import { createInternalAgentTextPart, log, normalizePromptTools, normalizeSDKResponse, resolveInheritedPromptTools } from "@/shared"
import { MESSAGE_STORAGE } from "../hook-message-injector" // EXCEPTION: background-agent reads hook-message-injector state for notifications
import { getTaskToastManager } from "../task-toast-manager" // EXCEPTION: background-agent orchestrates task-toast notifications
import { TASK_CLEANUP_DELAY_MS } from "./constants"
import { formatDuration } from "./duration-formatter"
import { findNearestMessageExcludingCompaction, isCompactionAgent } from "./compaction-aware-message-resolver"
import { buildBackgroundTaskNotificationText } from "./background-task-notification-template"
import { isAbortedSessionError, isRecord } from "./error-classifier"
import type { BackgroundTask } from "./types"
import { TaskStateManager } from "./state"

export class TaskNotificationManager {
  private pendingNotifications: Map<string, string[]>
  private notificationQueueByParent: Map<string, Promise<void>> = new Map()
  private enableParentSessionNotifications: boolean

  constructor(
    private stateManager: TaskStateManager,
    private ctx: PluginInput,
    options?: {
      enableParentSessionNotifications?: boolean
      pendingNotifications?: Map<string, string[]>
    }
  ) {
    this.pendingNotifications = options?.pendingNotifications ?? new Map()
    this.enableParentSessionNotifications = options?.enableParentSessionNotifications ?? true
  }

  markForNotification(task: BackgroundTask): void {
    this.stateManager.markForNotification(task)
  }

  getPendingNotifications(sessionID: string): BackgroundTask[] {
    return this.stateManager.getPendingNotifications(sessionID)
  }

  clearNotifications(sessionID: string): void {
    this.stateManager.clearNotifications(sessionID)
  }

  clearNotificationsForTask(taskId: string): void {
    this.stateManager.clearNotificationsForTask(taskId)
  }

  queuePendingNotification(sessionID: string | undefined, notification: string): void {
    if (!sessionID) return
    const existingNotifications = this.pendingNotifications.get(sessionID) ?? []
    existingNotifications.push(notification)
    this.pendingNotifications.set(sessionID, existingNotifications)
  }

  injectPendingNotificationsIntoChatMessage(output: { parts: Array<{ type: string; text?: string; [key: string]: unknown }> }, sessionID: string): void {
    const pendingNotifications = this.pendingNotifications.get(sessionID)
    if (!pendingNotifications || pendingNotifications.length === 0) {
      return
    }

    this.pendingNotifications.delete(sessionID)
    const notificationContent = pendingNotifications.join("\n\n")
    const firstTextPartIndex = output.parts.findIndex((part) => part.type === "text")

    if (firstTextPartIndex === -1) {
      output.parts.unshift(createInternalAgentTextPart(notificationContent))
      return
    }

    const originalText = output.parts[firstTextPartIndex].text ?? ""
    output.parts[firstTextPartIndex].text = `${notificationContent}\n\n---\n\n${originalText}`
  }

  clearPendingNotificationsForSession(sessionID: string): void {
    this.pendingNotifications.delete(sessionID)
  }

  enqueueNotificationForParent(parentSessionID: string | undefined, operation: () => Promise<void>): Promise<void> {
    if (!parentSessionID) {
      return operation()
    }

    const previous = this.notificationQueueByParent.get(parentSessionID) ?? Promise.resolve()
    const current = previous
      .catch(() => {})
      .then(operation)

    this.notificationQueueByParent.set(parentSessionID, current)

    void current.finally(() => {
      if (this.notificationQueueByParent.get(parentSessionID) === current) {
        this.notificationQueueByParent.delete(parentSessionID)
      }
    }).catch(() => {})

    return current
  }

  async notifyTaskCompletion(task: BackgroundTask): Promise<void> {
    const duration = formatDuration(task.startedAt ?? new Date(), task.completedAt)

    log("[background-agent] notifyParentSession called for task:", task.id)

    const toastManager = getTaskToastManager()
    if (toastManager) {
      toastManager.showCompletionToast({
        id: task.id,
        description: task.description,
        duration,
      })
    }

    const pendingSet = this.stateManager.pendingByParent.get(task.parentSessionID)
    let allComplete = false
    let remainingCount = 0
    if (pendingSet) {
      pendingSet.delete(task.id)
      remainingCount = pendingSet.size
      allComplete = remainingCount === 0
      if (allComplete) {
        this.stateManager.pendingByParent.delete(task.parentSessionID)
      }
    } else {
      allComplete = true
    }

    const completedTasks = allComplete
      ? Array.from(this.stateManager.tasks.values())
        .filter(t => t.parentSessionID === task.parentSessionID && t.status !== "running" && t.status !== "pending")
      : []

    const statusText = task.status === "completed" ? "COMPLETED" : task.status === "interrupt" ? "INTERRUPTED" : "CANCELLED"
    const notification = this.getNotificationContent({
      task,
      duration,
      statusText,
      allComplete,
      remainingCount,
      completedTasks,
    })

    let agent: string | undefined = task.parentAgent
    let model: { providerID: string; modelID: string } | undefined
    let tools: Record<string, boolean> | undefined = task.parentTools

    if (this.enableParentSessionNotifications) {
      try {
        const messagesResp = await this.ctx.client.session.messages({ path: { id: task.parentSessionID } })
        const messages = normalizeSDKResponse(messagesResp, [] as Array<{
          info?: {
            agent?: string
            model?: { providerID: string; modelID: string }
            modelID?: string
            providerID?: string
            tools?: Record<string, boolean | "allow" | "deny" | "ask">
          }
        }>)
        for (let i = messages.length - 1; i >= 0; i--) {
          const message = messages[i]
          const info = message?.info
          if (isCompactionAgent(info?.agent)) {
            continue
          }
          const normalizedTools = isRecord(info?.tools)
            ? normalizePromptTools(info.tools as Record<string, boolean | "allow" | "deny" | "ask">)
            : undefined
          if (info?.agent || info?.model || (info?.modelID && info?.providerID) || normalizedTools) {
            agent = info?.agent ?? task.parentAgent
            model = info?.model ?? (info?.providerID && info?.modelID ? { providerID: info.providerID, modelID: info.modelID } : undefined)
            tools = normalizedTools ?? tools
            break
          }
        }
      } catch (error) {
        if (isAbortedSessionError(error)) {
          log("[background-agent] Parent session aborted while loading messages; using messageDir fallback:", {
            taskId: task.id,
            parentSessionID: task.parentSessionID,
          })
        }
        const messageDir = join(MESSAGE_STORAGE, task.parentSessionID)
        const currentMessage = messageDir ? findNearestMessageExcludingCompaction(messageDir) : null
        agent = currentMessage?.agent ?? task.parentAgent
        model = currentMessage?.model?.providerID && currentMessage?.model?.modelID
          ? { providerID: currentMessage.model.providerID, modelID: currentMessage.model.modelID }
          : undefined
        tools = normalizePromptTools(currentMessage?.tools) ?? tools
      }

      const resolvedTools = resolveInheritedPromptTools(task.parentSessionID, tools)

      log("[background-agent] notifyParentSession context:", {
        taskId: task.id,
        resolvedAgent: agent,
        resolvedModel: model,
      })

      try {
        await this.ctx.client.session.promptAsync({
          path: { id: task.parentSessionID },
          body: {
            noReply: !allComplete,
            ...(agent !== undefined ? { agent } : {}),
            ...(model !== undefined ? { model } : {}),
            ...(resolvedTools ? { tools: resolvedTools } : {}),
            parts: [createInternalAgentTextPart(notification)],
          },
        })
        log("[background-agent] Sent notification to parent session:", {
          taskId: task.id,
          allComplete,
          noReply: !allComplete,
        })
      } catch (error) {
        if (isAbortedSessionError(error)) {
          log("[background-agent] Parent session aborted while sending notification; continuing cleanup:", {
            taskId: task.id,
            parentSessionID: task.parentSessionID,
          })
          this.queuePendingNotification(task.parentSessionID, notification)
        } else {
          log("[background-agent] Failed to send notification:", error)
        }
      }
    } else {
      log("[background-agent] Parent session notifications disabled, skipping prompt injection:", {
        taskId: task.id,
        parentSessionID: task.parentSessionID,
      })
    }

    if (allComplete) {
      this.scheduleCompletionCleanup(completedTasks)
    }
  }

  shutdown(): void {
    this.pendingNotifications.clear()
    this.notificationQueueByParent.clear()
  }

  private getNotificationContent(input: {
    task: BackgroundTask
    duration: string
    statusText: "COMPLETED" | "CANCELLED" | "INTERRUPTED"
    allComplete: boolean
    remainingCount: number
    completedTasks: BackgroundTask[]
  }): string {
    const content = buildBackgroundTaskNotificationText(input)
    if (input.allComplete) {
      return content
    }
    return content.replace(/^\*\*Agent:\*\*.*\n/m, "")
  }

  private scheduleCompletionCleanup(completedTasks: BackgroundTask[]): void {
    for (const completedTask of completedTasks) {
      const taskId = completedTask.id
      const existingTimer = this.stateManager.completionTimers.get(taskId)
      if (existingTimer) {
        clearTimeout(existingTimer)
        this.stateManager.completionTimers.delete(taskId)
      }
      const timer = setTimeout(() => {
        this.stateManager.completionTimers.delete(taskId)
        if (this.stateManager.tasks.has(taskId)) {
          this.clearNotificationsForTask(taskId)
          this.stateManager.tasks.delete(taskId)
          log("[background-agent] Removed completed task from memory:", taskId)
        }
      }, TASK_CLEANUP_DELAY_MS)
      this.stateManager.completionTimers.set(taskId, timer)
    }
  }
}
