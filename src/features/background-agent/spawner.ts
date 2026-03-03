import type { BackgroundTask, LaunchInput, ResumeInput } from "./types"
import type { OpencodeClient, OnSubagentSessionCreated, QueueItem } from "./constants"
import { TMUX_CALLBACK_DELAY_MS } from "./constants"
import { log, getAgentToolRestrictions, promptWithModelSuggestionRetry, createInternalAgentTextPart } from "@/shared"
import { subagentSessions } from "../claude-code-session-state" // EXCEPTION: background-agent orchestrates session state
import { getTaskToastManager } from "../task-toast-manager" // EXCEPTION: background-agent orchestrates task-toast notifications
import { isInsideTmux } from "@/shared/tmux"
import type { ConcurrencyManager } from "./concurrency"
import { setSessionTools } from "@/shared/session/session-tools-store"
import type { TaskHistory } from "./task-history"
import { TaskStateManager } from "./state"

export interface SpawnerContext {
  client: OpencodeClient
  directory: string
  concurrencyManager: ConcurrencyManager
  tmuxEnabled: boolean
  onSubagentSessionCreated?: OnSubagentSessionCreated
  onTaskError: (task: BackgroundTask, error: Error) => void
}

interface StartTaskOptions {
  includeSessionTitle?: boolean
  onTaskStarted?: (task: BackgroundTask, input: LaunchInput, sessionID: string) => void
  onPromptToolsResolved?: (sessionID: string, tools: Record<string, boolean>) => void
}

interface ResumeTaskOptions {
  onPromptToolsResolved?: (sessionID: string, tools: Record<string, boolean>) => void
}

interface TaskSpawnerOptions {
  taskHistory: TaskHistory
  processKey: (key: string) => Promise<void>
  startPolling: () => void
  markForNotification: (task: BackgroundTask) => void
  cleanupPendingByParent: (task: BackgroundTask) => void
  enqueueNotificationForParent: (
    parentSessionID: string | undefined,
    operation: () => Promise<void>
  ) => Promise<void>
  notifyParentSession: (task: BackgroundTask) => Promise<void>
}

export function createTask(input: LaunchInput): BackgroundTask {
  return {
    id: `bg_${crypto.randomUUID().slice(0, 8)}`,
    status: "pending",
    queuedAt: new Date(),
    description: input.description,
    prompt: input.prompt,
    agent: input.agent,
    parentSessionID: input.parentSessionID,
    parentMessageID: input.parentMessageID,
    parentModel: input.parentModel,
    parentAgent: input.parentAgent,
    model: input.model,
  }
}

export async function startTask(
  item: QueueItem,
  ctx: SpawnerContext,
  options?: StartTaskOptions
): Promise<void> {
  const { task, input } = item
  const { client, directory, concurrencyManager, tmuxEnabled, onSubagentSessionCreated, onTaskError } = ctx

  log("[background-agent] Starting task:", {
    taskId: task.id,
    agent: input.agent,
    model: input.model,
  })

  const concurrencyKey = input.model
    ? `${input.model.providerID}/${input.model.modelID}`
    : input.agent

  const parentSession = await client.session.get({
    path: { id: input.parentSessionID },
  }).catch((err) => {
    log(`[background-agent] Failed to get parent session: ${err}`)
    return null
  })
  const parentDirectory = parentSession?.data?.directory ?? directory
  log(`[background-agent] Parent dir: ${parentSession?.data?.directory}, using: ${parentDirectory}`)

  const createResult = await client.session.create({
    body: {
      parentID: input.parentSessionID,
      ...(options?.includeSessionTitle ? { title: `${input.description} (@${input.agent} subagent)` } : {}),
    } as Record<string, unknown>,
    query: {
      directory: parentDirectory,
    },
  }).catch((error) => {
    concurrencyManager.release(concurrencyKey)
    throw error
  })

  if (createResult.error) {
    concurrencyManager.release(concurrencyKey)
    throw new Error(`Failed to create background session: ${createResult.error}`)
  }

  if (!createResult.data?.id) {
    concurrencyManager.release(concurrencyKey)
    throw new Error("Failed to create background session: API returned no session ID")
  }

  const sessionID = createResult.data.id
  subagentSessions.add(sessionID)

  log("[background-agent] tmux callback check", {
    hasCallback: !!onSubagentSessionCreated,
    tmuxEnabled,
    isInsideTmux: isInsideTmux(),
    sessionID,
    parentID: input.parentSessionID,
  })

  if (onSubagentSessionCreated && tmuxEnabled && isInsideTmux()) {
    log("[background-agent] Invoking tmux callback NOW", { sessionID })
    await onSubagentSessionCreated({
      sessionID,
      parentID: input.parentSessionID,
      title: input.description,
    }).catch((err) => {
      log("[background-agent] Failed to spawn tmux pane:", err)
    })
    log("[background-agent] tmux callback completed, waiting")
    await new Promise(r => setTimeout(r, TMUX_CALLBACK_DELAY_MS))
  } else {
    log("[background-agent] SKIP tmux callback - conditions not met")
  }

  task.status = "running"
  task.startedAt = new Date()
  task.sessionID = sessionID
  task.progress = {
    toolCalls: 0,
    lastUpdate: new Date(),
  }
  task.concurrencyKey = concurrencyKey
  task.concurrencyGroup = concurrencyKey

  options?.onTaskStarted?.(task, input, sessionID)

  log("[background-agent] Launching task:", { taskId: task.id, sessionID, agent: input.agent })

  const toastManager = getTaskToastManager()
  if (toastManager) {
    toastManager.updateTask(task.id, "running")
  }

  log("[background-agent] Calling prompt (fire-and-forget) for launch with:", {
    sessionID,
    agent: input.agent,
    model: input.model,
    hasSkillContent: !!input.skillContent,
    promptLength: input.prompt.length,
  })

  const launchModel = input.model
    ? { providerID: input.model.providerID, modelID: input.model.modelID }
    : undefined
  const launchVariant = input.model?.variant

  promptWithModelSuggestionRetry(client, {
    path: { id: sessionID },
    body: {
      agent: input.agent,
      ...(launchModel ? { model: launchModel } : {}),
      ...(launchVariant ? { variant: launchVariant } : {}),
      system: input.skillContent,
      tools: {
        task: false,
        call_agent: true,
        question: false,
        ...getAgentToolRestrictions(input.agent),
      },
      parts: [createInternalAgentTextPart(input.prompt)],
    },
  }).then(() => {
    const tools = {
      task: false,
      call_agent: true,
      question: false,
      ...getAgentToolRestrictions(input.agent),
    }
    options?.onPromptToolsResolved?.(sessionID, tools)
  }).catch((error) => {
    log("[background-agent] promptAsync error:", error)
    onTaskError(task, error instanceof Error ? error : new Error(String(error)))
  })
}

export async function resumeTask(
  task: BackgroundTask,
  input: ResumeInput,
  ctx: Pick<SpawnerContext, "client" | "concurrencyManager" | "onTaskError">,
  options?: ResumeTaskOptions
): Promise<void> {
  const { client, concurrencyManager, onTaskError } = ctx

  if (!task.sessionID) {
    throw new Error(`Task has no sessionID: ${task.id}`)
  }

  if (task.status === "running") {
    log("[background-agent] Resume skipped - task already running:", {
      taskId: task.id,
      sessionID: task.sessionID,
    })
    return
  }

  const concurrencyKey = task.concurrencyGroup ?? task.agent
  await concurrencyManager.acquire(concurrencyKey)
  task.concurrencyKey = concurrencyKey
  task.concurrencyGroup = concurrencyKey

  task.status = "running"
  task.completedAt = undefined
  task.error = undefined
  task.parentSessionID = input.parentSessionID
  task.parentMessageID = input.parentMessageID
  task.parentModel = input.parentModel
  task.parentAgent = input.parentAgent
  if (input.parentTools) {
    task.parentTools = input.parentTools
  }
  task.startedAt = new Date()

  task.progress = {
    toolCalls: task.progress?.toolCalls ?? 0,
    lastUpdate: new Date(),
  }

  subagentSessions.add(task.sessionID)

  const toastManager = getTaskToastManager()
  if (toastManager) {
    toastManager.addTask({
      id: task.id,
      description: task.description,
      agent: task.agent,
      isBackground: true,
    })
  }

  log("[background-agent] Resuming task:", { taskId: task.id, sessionID: task.sessionID })

  log("[background-agent] Resuming task - calling prompt (fire-and-forget) with:", {
    sessionID: task.sessionID,
    agent: task.agent,
    model: task.model,
    promptLength: input.prompt.length,
  })

  const resumeModel = task.model
    ? { providerID: task.model.providerID, modelID: task.model.modelID }
    : undefined
  const resumeVariant = task.model?.variant

  client.session.promptAsync({
    path: { id: task.sessionID },
    body: {
      agent: task.agent,
      ...(resumeModel ? { model: resumeModel } : {}),
      ...(resumeVariant ? { variant: resumeVariant } : {}),
      tools: {
        task: false,
        call_agent: true,
        question: false,
        ...getAgentToolRestrictions(task.agent),
      },
      parts: [createInternalAgentTextPart(input.prompt)],
    },
  }).then(() => {
    const tools = {
      task: false,
      call_agent: true,
      question: false,
      ...getAgentToolRestrictions(task.agent),
    }
    options?.onPromptToolsResolved?.(task.sessionID!, tools)
  }).catch((error) => {
    log("[background-agent] resume prompt error:", error)
    onTaskError(task, error instanceof Error ? error : new Error(String(error)))
  })
}

export class TaskSpawner {
  constructor(
    private stateManager: TaskStateManager,
    private ctx: Omit<SpawnerContext, "onTaskError">,
    private options: TaskSpawnerOptions
  ) {}

  async launch(input: LaunchInput): Promise<BackgroundTask> {
    log("[background-agent] launch() called with:", {
      agent: input.agent,
      model: input.model,
      description: input.description,
      parentSessionID: input.parentSessionID,
    })

    if (!input.agent || input.agent.trim() === "") {
      throw new Error("Agent parameter is required")
    }

    const task: BackgroundTask = {
      ...createTask(input),
      parentTools: input.parentTools,
      fallbackChain: input.fallbackChain,
      attemptCount: 0,
      category: input.category,
    }

    this.stateManager.tasks.set(task.id, task)
    this.options.taskHistory.record(input.parentSessionID, {
      id: task.id,
      agent: input.agent,
      description: input.description,
      status: "pending",
      category: input.category,
    })

    if (input.parentSessionID) {
      const pending = this.stateManager.pendingByParent.get(input.parentSessionID) ?? new Set<string>()
      pending.add(task.id)
      this.stateManager.pendingByParent.set(input.parentSessionID, pending)
    }

    const key = this.stateManager.getConcurrencyKeyFromInput(input)
    const queue = this.stateManager.queuesByKey.get(key) ?? []
    queue.push({ task, input })
    this.stateManager.queuesByKey.set(key, queue)

    log("[background-agent] Task queued:", { taskId: task.id, key, queueLength: queue.length })

    const toastManager = getTaskToastManager()
    if (toastManager) {
      toastManager.addTask({
        id: task.id,
        description: input.description,
        agent: input.agent,
        isBackground: true,
        status: "queued",
        skills: input.skills,
      })
    }

    setTimeout(() => {
      void this.options.processKey(key)
    }, 0)

    return task
  }

  async resume(input: ResumeInput): Promise<BackgroundTask> {
    const existingTask = this.stateManager.findBySession(input.sessionId)
    if (!existingTask) {
      throw new Error(`Task not found for session: ${input.sessionId}`)
    }

    if (!existingTask.sessionID) {
      throw new Error(`Task has no sessionID: ${existingTask.id}`)
    }

    if (existingTask.status === "running") {
      log("[background-agent] Resume skipped - task already running:", {
        taskId: existingTask.id,
        sessionID: existingTask.sessionID,
      })
      return existingTask
    }

    const completionTimer = this.stateManager.completionTimers.get(existingTask.id)
    if (completionTimer) {
      clearTimeout(completionTimer)
      this.stateManager.completionTimers.delete(existingTask.id)
    }

    await resumeTask(
      existingTask,
      input,
      {
        client: this.ctx.client,
        concurrencyManager: this.ctx.concurrencyManager,
        onTaskError: (task, error) => this.handleResumePromptError(task, error),
      },
      {
        onPromptToolsResolved: (sessionID, tools) => {
          setSessionTools(sessionID, tools)
        },
      }
    )

    this.options.startPolling()
    if (existingTask.sessionID) {
      subagentSessions.add(existingTask.sessionID)
    }

    if (input.parentSessionID) {
      const pending = this.stateManager.pendingByParent.get(input.parentSessionID) ?? new Set<string>()
      pending.add(existingTask.id)
      this.stateManager.pendingByParent.set(input.parentSessionID, pending)
    }

    const toastManager = getTaskToastManager()
    if (toastManager) {
      toastManager.addTask({
        id: existingTask.id,
        description: existingTask.description,
        agent: existingTask.agent,
        isBackground: true,
      })
    }

    return existingTask
  }

  async processKey(
    key: string,
    startTask: (item: QueueItem) => Promise<void> = (item) => this.startTask(item)
  ): Promise<void> {
    if (this.stateManager.processingKeys.has(key)) {
      return
    }

    this.stateManager.processingKeys.add(key)

    try {
      const queue = this.stateManager.queuesByKey.get(key)
      while (queue && queue.length > 0) {
        const item = queue[0]

        await this.ctx.concurrencyManager.acquire(key)

        if (item.task.status === "cancelled" || item.task.status === "error") {
          this.ctx.concurrencyManager.release(key)
          queue.shift()
          continue
        }

        try {
          await startTask(item)
        } catch (error) {
          log("[background-agent] Error starting task:", error)
          if (!item.task.concurrencyKey) {
            this.ctx.concurrencyManager.release(key)
          }
        }

        queue.shift()
      }
    } finally {
      this.stateManager.processingKeys.delete(key)
    }
  }

  removePendingTaskFromQueue(task: BackgroundTask): void {
    const key = this.stateManager.getConcurrencyKeyFromTask(task)
    this.stateManager.removeFromQueue(key, task.id)
  }

  async startTask(item: QueueItem): Promise<void> {
    await startTask(
      item,
      {
        ...this.ctx,
        onTaskError: (task, error) => this.handleLaunchPromptError(task, error, item.input),
      },
      {
        includeSessionTitle: true,
        onTaskStarted: (task, input, sessionID) => {
          this.options.taskHistory.record(input.parentSessionID, {
            id: task.id,
            sessionID,
            agent: input.agent,
            description: input.description,
            status: "running",
            category: input.category,
            startedAt: task.startedAt,
          })
          this.options.startPolling()
        },
        onPromptToolsResolved: (sessionID, tools) => {
          setSessionTools(sessionID, tools)
        },
      }
    )
  }

  private handleLaunchPromptError(task: BackgroundTask, error: Error, input: LaunchInput): void {
    task.status = "interrupt"
    const errorMessage = error.message
    if (errorMessage.includes("agent.name") || errorMessage.includes("undefined")) {
      task.error = `Agent "${input.agent}" not found. Make sure the agent is registered in your opencode.json or provided by a plugin.`
    } else {
      task.error = errorMessage
    }

    task.completedAt = new Date()
    if (task.concurrencyKey) {
      this.ctx.concurrencyManager.release(task.concurrencyKey)
      task.concurrencyKey = undefined
    }

    if (task.sessionID) {
      this.ctx.client.session.abort({
        path: { id: task.sessionID },
      }).catch(() => {})
    }

    this.options.markForNotification(task)
    this.options.cleanupPendingByParent(task)
    this.options.enqueueNotificationForParent(task.parentSessionID, () => this.options.notifyParentSession(task)).catch(err => {
      log("[background-agent] Failed to notify on error:", err)
    })
  }

  private handleResumePromptError(task: BackgroundTask, error: Error): void {
    task.status = "interrupt"
    task.error = error.message
    task.completedAt = new Date()

    if (task.concurrencyKey) {
      this.ctx.concurrencyManager.release(task.concurrencyKey)
      task.concurrencyKey = undefined
    }

    if (task.sessionID) {
      this.ctx.client.session.abort({
        path: { id: task.sessionID },
      }).catch(() => {})
    }

    this.options.markForNotification(task)
    this.options.cleanupPendingByParent(task)
    this.options.enqueueNotificationForParent(task.parentSessionID, () => this.options.notifyParentSession(task)).catch(err => {
      log("[background-agent] Failed to notify on resume error:", err)
    })
  }
}
