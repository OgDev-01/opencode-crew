import type { OpenCodeCrewConfig, HookName } from "@/config"
import type { ModelCacheState } from "@/plugin-state"
import type { PluginContext } from "../types"

import {
  createContextWindowMonitorHook,
  createSessionRecoveryHook,
  createSessionNotification,
  createThinkModeHook,
  createModelFallbackHook,
  createAnthropicContextWindowLimitRecoveryHook,
  createAutoUpdateCheckerHook,
  createAgentUsageReminderHook,
  createNonInteractiveEnvHook,
  createInteractiveBashSessionHook,
  createRalphLoopHook,
  createEditErrorRecoveryHook,
  createDelegateTaskRetryHook,
  createTaskResumeInfoHook,
  createStartWorkHook,
  createStrategistMdOnlyHook,
  createCadetNotepadHook,
  createNoCaptainGptHook,
  createNoCraftsmanNonGptHook,
  createQuestionLabelTruncatorHook,
  createPreemptiveCompactionHook,
  createRuntimeFallbackHook,
  createMemoryLearningHook,
  createMemoryDecisionDetectionHook,
} from "@/hooks"
import { createAnthropicEffortHook } from "@/hooks/anthropic-effort"
import {
  detectExternalNotificationPlugin,
  getNotificationConflictWarning,
  log,
  normalizeSDKResponse,
} from "@/shared"
import { safeCreateHook } from "@/shared/hook-utils/safe-create-hook"
import { sessionExists } from "@/tools"
import { hookSlot } from "./hook-slot"

export type SessionHooks = {
  contextWindowMonitor: ReturnType<typeof createContextWindowMonitorHook> | null
  preemptiveCompaction: ReturnType<typeof createPreemptiveCompactionHook> | null
  sessionRecovery: ReturnType<typeof createSessionRecoveryHook> | null
  sessionNotification: ReturnType<typeof createSessionNotification> | null
  thinkMode: ReturnType<typeof createThinkModeHook> | null
  modelFallback: ReturnType<typeof createModelFallbackHook> | null
  anthropicContextWindowLimitRecovery: ReturnType<typeof createAnthropicContextWindowLimitRecoveryHook> | null
  autoUpdateChecker: ReturnType<typeof createAutoUpdateCheckerHook> | null
  agentUsageReminder: ReturnType<typeof createAgentUsageReminderHook> | null
  nonInteractiveEnv: ReturnType<typeof createNonInteractiveEnvHook> | null
  interactiveBashSession: ReturnType<typeof createInteractiveBashSessionHook> | null
  ralphLoop: ReturnType<typeof createRalphLoopHook> | null
  editErrorRecovery: ReturnType<typeof createEditErrorRecoveryHook> | null
  delegateTaskRetry: ReturnType<typeof createDelegateTaskRetryHook> | null
  startWork: ReturnType<typeof createStartWorkHook> | null
  strategistMdOnly: ReturnType<typeof createStrategistMdOnlyHook> | null
  cadetNotepad: ReturnType<typeof createCadetNotepadHook> | null
  noCaptainGpt: ReturnType<typeof createNoCaptainGptHook> | null
  noCraftsmanNonGpt: ReturnType<typeof createNoCraftsmanNonGptHook> | null
  questionLabelTruncator: ReturnType<typeof createQuestionLabelTruncatorHook> | null
  taskResumeInfo: ReturnType<typeof createTaskResumeInfoHook> | null
  anthropicEffort: ReturnType<typeof createAnthropicEffortHook> | null
  runtimeFallback: ReturnType<typeof createRuntimeFallbackHook> | null
  memoryLearning: ReturnType<typeof createMemoryLearningHook> | null
  memoryDecisionDetection: ReturnType<typeof createMemoryDecisionDetectionHook> | null
}

export function createSessionHooks(args: {
  ctx: PluginContext
  pluginConfig: OpenCodeCrewConfig
  modelCacheState: ModelCacheState
  isHookEnabled: (hookName: HookName) => boolean
  safeHookEnabled: boolean
}): SessionHooks {
  const { ctx, pluginConfig, modelCacheState, isHookEnabled, safeHookEnabled } = args

  const contextWindowMonitor = hookSlot("context-window-monitor", () => createContextWindowMonitorHook(ctx, modelCacheState), isHookEnabled, safeHookEnabled)

  // OUTLIER: Double gate - requires both hook enabled AND experimental config flag
  const preemptiveCompaction =
    isHookEnabled("preemptive-compaction") &&
    pluginConfig.experimental?.preemptive_compaction
      ? safeCreateHook(
          "preemptive-compaction",
          () => createPreemptiveCompactionHook(ctx, pluginConfig, modelCacheState),
          { enabled: safeHookEnabled },
        )
      : null

  const sessionRecovery = hookSlot("session-recovery", () => createSessionRecoveryHook(ctx, { experimental: pluginConfig.experimental }), isHookEnabled, safeHookEnabled)

  // OUTLIER: Complex gating - checks force_enable flag and detects external notification plugins
  let sessionNotification: ReturnType<typeof createSessionNotification> | null = null
  if (isHookEnabled("session-notification")) {
    const forceEnable = pluginConfig.notification?.force_enable ?? false
    const externalNotifier = detectExternalNotificationPlugin(ctx.directory)
    if (externalNotifier.detected && !forceEnable) {
      log(getNotificationConflictWarning(externalNotifier.pluginName!))
    } else {
      sessionNotification = safeCreateHook(
        "session-notification",
        () => createSessionNotification(ctx),
        { enabled: safeHookEnabled },
      )
    }
  }

  const thinkMode = hookSlot("think-mode", () => createThinkModeHook(), isHookEnabled, safeHookEnabled)

  const enableFallbackTitle = pluginConfig.experimental?.model_fallback_title ?? false
  const fallbackTitleMaxEntries = 200
  const fallbackTitleState = new Map<string, { baseTitle?: string; lastKey?: string }>()
  const updateFallbackTitle = async (input: {
    sessionID: string
    providerID: string
    modelID: string
    variant?: string
  }) => {
    if (!enableFallbackTitle) return
    const key = `${input.providerID}/${input.modelID}${input.variant ? `:${input.variant}` : ""}`
    const existing = fallbackTitleState.get(input.sessionID) ?? {}
    if (existing.lastKey === key) return

    if (!existing.baseTitle) {
      const sessionResp = await ctx.client.session.get({ path: { id: input.sessionID } }).catch(() => null)
      const sessionInfo = sessionResp
        ? normalizeSDKResponse(sessionResp, null as { title?: string } | null, { preferResponseOnMissingData: true })
        : null
      const rawTitle = sessionInfo?.title
      if (typeof rawTitle === "string" && rawTitle.length > 0) {
        existing.baseTitle = rawTitle.replace(/\s*\[fallback:[^\]]+\]$/i, "").trim()
      } else {
        existing.baseTitle = "Session"
      }
    }

    const variantLabel = input.variant ? ` ${input.variant}` : ""
    const newTitle = `${existing.baseTitle} [fallback: ${input.providerID}/${input.modelID}${variantLabel}]`

    await ctx.client.session
      .update({
        path: { id: input.sessionID },
        body: { title: newTitle },
        query: { directory: ctx.directory },
      })
      .catch(() => {})

    existing.lastKey = key
    fallbackTitleState.set(input.sessionID, existing)
    if (fallbackTitleState.size > fallbackTitleMaxEntries) {
      const oldestKey = fallbackTitleState.keys().next().value
      if (oldestKey) fallbackTitleState.delete(oldestKey)
    }
  }

  // OUTLIER: Extra config parameter (isModelFallbackConfigEnabled) + inline helper function (updateFallbackTitle)
  const isModelFallbackConfigEnabled = pluginConfig.model_fallback ?? false
  const modelFallback = isModelFallbackConfigEnabled && isHookEnabled("model-fallback")
    ? safeCreateHook(
        "model-fallback",
        () =>
          createModelFallbackHook({
            toast: async ({ title, message, variant, duration }) => {
              await ctx.client.tui
                .showToast({
                  body: {
                    title,
                    message,
                    variant: variant ?? "warning",
                    duration: duration ?? 5000,
                  },
                })
                .catch(() => {})
            },
            onApplied: enableFallbackTitle ? updateFallbackTitle : undefined,
          }),
        { enabled: safeHookEnabled },
      )
    : null

  const anthropicContextWindowLimitRecovery = hookSlot("anthropic-context-window-limit-recovery", () => createAnthropicContextWindowLimitRecoveryHook(ctx, { experimental: pluginConfig.experimental, pluginConfig }), isHookEnabled, safeHookEnabled)
  const autoUpdateChecker = hookSlot("auto-update-checker", () => createAutoUpdateCheckerHook(ctx, { showStartupToast: isHookEnabled("startup-toast"), isCaptainEnabled: pluginConfig.captain_agent?.disabled !== true, autoUpdate: pluginConfig.auto_update ?? true }), isHookEnabled, safeHookEnabled)
  const agentUsageReminder = hookSlot("agent-usage-reminder", () => createAgentUsageReminderHook(ctx), isHookEnabled, safeHookEnabled)
  const nonInteractiveEnv = hookSlot("non-interactive-env", () => createNonInteractiveEnvHook(ctx), isHookEnabled, safeHookEnabled)
  const interactiveBashSession = hookSlot("interactive-bash-session", () => createInteractiveBashSessionHook(ctx), isHookEnabled, safeHookEnabled)
  const ralphLoop = hookSlot("ralph-loop", () => createRalphLoopHook(ctx, { config: pluginConfig.ralph_loop, checkSessionExists: async (sessionId) => await sessionExists(sessionId) }), isHookEnabled, safeHookEnabled)
  const editErrorRecovery = hookSlot("edit-error-recovery", () => createEditErrorRecoveryHook(ctx), isHookEnabled, safeHookEnabled)
  const delegateTaskRetry = hookSlot("delegate-task-retry", () => createDelegateTaskRetryHook(ctx), isHookEnabled, safeHookEnabled)
  const startWork = hookSlot("start-work", () => createStartWorkHook(ctx), isHookEnabled, safeHookEnabled)
  const strategistMdOnly = hookSlot("strategist-md-only", () => createStrategistMdOnlyHook(ctx), isHookEnabled, safeHookEnabled)
  const cadetNotepad = hookSlot("cadet-notepad", () => createCadetNotepadHook(ctx), isHookEnabled, safeHookEnabled)
  const noCaptainGpt = hookSlot("no-captain-gpt", () => createNoCaptainGptHook(ctx), isHookEnabled, safeHookEnabled)
  const noCraftsmanNonGpt = hookSlot("no-craftsman-non-gpt", () => createNoCraftsmanNonGptHook(ctx, { allowNonGptModel: pluginConfig.agents?.craftsman?.allow_non_gpt_model }), isHookEnabled, safeHookEnabled)
  const questionLabelTruncator = hookSlot("question-label-truncator", () => createQuestionLabelTruncatorHook(), isHookEnabled, safeHookEnabled)
  const taskResumeInfo = hookSlot("task-resume-info", () => createTaskResumeInfoHook(), isHookEnabled, safeHookEnabled)
  const anthropicEffort = hookSlot("anthropic-effort", () => createAnthropicEffortHook(), isHookEnabled, safeHookEnabled)
  const runtimeFallback = hookSlot("runtime-fallback", () => {
    const runtimeFallbackConfig =
      typeof pluginConfig.runtime_fallback === "boolean"
        ? { enabled: pluginConfig.runtime_fallback }
        : pluginConfig.runtime_fallback
    return createRuntimeFallbackHook(ctx, { config: runtimeFallbackConfig, pluginConfig })
  }, isHookEnabled, safeHookEnabled)

  // OUTLIER: Dynamic require() gate - uses require() to conditionally load memory manager
  const memoryLearning = isHookEnabled("memory-learning")
    ? safeCreateHook("memory-learning", () => {
        try {
          const { getMemoryManager } = require("../../features/memory/manager")
          const manager = getMemoryManager()
          return createMemoryLearningHook({
            storage: manager.storage,
            autoCapture: pluginConfig.memory?.auto_capture,
            privacyTags: pluginConfig.memory?.privacy_tags,
          })
        } catch (error) {
          log(`Failed to initialize memory-learning hook: ${error instanceof Error ? error.message : String(error)}`)
          return null
        }
      }, { enabled: safeHookEnabled })
    : null

  const memoryDecisionDetection = isHookEnabled("memory-decision-detection")
    ? safeCreateHook("memory-decision-detection", () => {
        try {
          const { getMemoryManager } = require("../../features/memory/manager")
          const manager = getMemoryManager()
          return createMemoryDecisionDetectionHook({
            storage: manager.storage,
            autoCapture: pluginConfig.memory?.auto_capture,
            privacyTags: pluginConfig.memory?.privacy_tags,
          })
        } catch (error) {
          log(`Failed to initialize memory-decision-detection hook: ${error instanceof Error ? error.message : String(error)}`)
          return null
        }
      }, { enabled: safeHookEnabled })
    : null

  return {
    contextWindowMonitor,
    preemptiveCompaction,
    sessionRecovery,
    sessionNotification,
    thinkMode,
    modelFallback,
    anthropicContextWindowLimitRecovery,
    autoUpdateChecker,
    agentUsageReminder,
    nonInteractiveEnv,
    interactiveBashSession,
    ralphLoop,
    editErrorRecovery,
    delegateTaskRetry,
    startWork,
    strategistMdOnly,
    cadetNotepad,
    noCaptainGpt,
    noCraftsmanNonGpt,
    questionLabelTruncator,
    taskResumeInfo,
    anthropicEffort,
    runtimeFallback,
    memoryLearning,
    memoryDecisionDetection,
  }
}
