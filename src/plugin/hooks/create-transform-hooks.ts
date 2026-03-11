import type { HookName, OpenCodeCrewConfig } from "@/config"
import type { PluginContext } from "../types"

import {
  createClaudeCodeHooksHook,
  createKeywordDetectorHook,
  createThinkingBlockValidatorHook,
  createMemoryInjectionHook,
  createHeartbeatPrunerHook,
} from "@/hooks"
import {
  contextCollector,
  createContextInjectorMessagesTransformHook,
} from "@/features/context-injector"
import { getMainSessionID } from "@/features/claude-code-session-state"
import { safeCreateHook } from "@/shared/hook-utils/safe-create-hook"
import { hookSlot } from "./hook-slot"
import { log } from "@/shared"


export type TransformHooks = {
  claudeCodeHooks: ReturnType<typeof createClaudeCodeHooksHook> | null
  keywordDetector: ReturnType<typeof createKeywordDetectorHook> | null
  contextInjectorMessagesTransform: ReturnType<typeof createContextInjectorMessagesTransformHook>
  thinkingBlockValidator: ReturnType<typeof createThinkingBlockValidatorHook> | null
  memoryInjection: ReturnType<typeof createMemoryInjectionHook> | null
  heartbeatPruner: ReturnType<typeof createHeartbeatPrunerHook> | null
}

export function createTransformHooks(args: {
  ctx: PluginContext
  pluginConfig: OpenCodeCrewConfig
  isHookEnabled: (hookName: HookName) => boolean
  safeHookEnabled?: boolean
}): TransformHooks {
  const { ctx, pluginConfig, isHookEnabled } = args
  const safeHookEnabled = args.safeHookEnabled ?? true

  const claudeCodeHooks = hookSlot("claude-code-hooks", () => createClaudeCodeHooksHook(ctx, { disabledHooks: (pluginConfig.claude_code?.hooks ?? true) ? undefined : true, keywordDetectorDisabled: !isHookEnabled("keyword-detector") }, contextCollector), isHookEnabled, safeHookEnabled)

  const keywordDetector = hookSlot("keyword-detector", () => createKeywordDetectorHook(ctx, contextCollector), isHookEnabled, safeHookEnabled)

  const contextInjectorMessagesTransform =
    // OUTLIER: Always-on - no isHookEnabled() check, always registered
    createContextInjectorMessagesTransformHook(contextCollector)

  const thinkingBlockValidator = hookSlot("thinking-block-validator", () => createThinkingBlockValidatorHook(), isHookEnabled, safeHookEnabled)

  const memoryInjection = hookSlot("memory-injection", () => { try { const { getMemoryManager } = require("../../features/memory/manager"); const manager = getMemoryManager(); return createMemoryInjectionHook({ search: manager.search, collector: contextCollector, getMainSessionID, recordLearningConsulted: async (learning) => { await manager.storage.incrementTimesConsulted(learning.id) } }) } catch (error) { log(`Failed to initialize memory-injection hook: ${error instanceof Error ? error.message : String(error)}`); return null } }, isHookEnabled, safeHookEnabled)

  const heartbeatPruner = hookSlot("heartbeat-pruner", () => createHeartbeatPrunerHook(), isHookEnabled, safeHookEnabled)

  return {
    claudeCodeHooks,
    keywordDetector,
    contextInjectorMessagesTransform,
    thinkingBlockValidator,
    memoryInjection,
    heartbeatPruner,
  }
}
