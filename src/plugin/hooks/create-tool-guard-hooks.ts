import type { HookName, OpenCodeCrewConfig } from "@/config"
import type { ModelCacheState } from "@/plugin-state"
import type { PluginContext } from "../types"

import {
  createCommentCheckerHooks,
  createToolOutputTruncatorHook,
  createDirectoryAgentsInjectorHook,
  createDirectoryReadmeInjectorHook,
  createEmptyTaskResponseDetectorHook,
  createRulesInjectorHook,
  createTasksTodowriteDisablerHook,
  createWriteExistingFileGuardHook,
  createHashlineReadEnhancerHook,
  createReadImageResizerHook,
  createJsonErrorRecoveryHook,
} from "@/hooks"
import {
  getOpenCodeVersion,
  isOpenCodeVersionAtLeast,
  log,
  OPENCODE_NATIVE_AGENTS_INJECTION_VERSION,
} from "@/shared"
import { safeCreateHook } from "@/shared/hook-utils/safe-create-hook"
import { hookSlot } from "./hook-slot"

export type ToolGuardHooks = {
  commentChecker: ReturnType<typeof createCommentCheckerHooks> | null
  toolOutputTruncator: ReturnType<typeof createToolOutputTruncatorHook> | null
  directoryAgentsInjector: ReturnType<typeof createDirectoryAgentsInjectorHook> | null
  directoryReadmeInjector: ReturnType<typeof createDirectoryReadmeInjectorHook> | null
  emptyTaskResponseDetector: ReturnType<typeof createEmptyTaskResponseDetectorHook> | null
  rulesInjector: ReturnType<typeof createRulesInjectorHook> | null
  tasksTodowriteDisabler: ReturnType<typeof createTasksTodowriteDisablerHook> | null
  writeExistingFileGuard: ReturnType<typeof createWriteExistingFileGuardHook> | null
  hashlineReadEnhancer: ReturnType<typeof createHashlineReadEnhancerHook> | null
  jsonErrorRecovery: ReturnType<typeof createJsonErrorRecoveryHook> | null
  readImageResizer: ReturnType<typeof createReadImageResizerHook> | null
}

export function createToolGuardHooks(args: {
  ctx: PluginContext
  pluginConfig: OpenCodeCrewConfig
  modelCacheState: ModelCacheState
  isHookEnabled: (hookName: HookName) => boolean
  safeHookEnabled: boolean
}): ToolGuardHooks {
  const { ctx, pluginConfig, modelCacheState, isHookEnabled, safeHookEnabled } = args

  const commentChecker = hookSlot("comment-checker", () => createCommentCheckerHooks(pluginConfig.comment_checker), isHookEnabled, safeHookEnabled)

  const toolOutputTruncator = hookSlot(
    "tool-output-truncator",
    () => createToolOutputTruncatorHook(ctx, { modelCacheState, experimental: pluginConfig.experimental }),
    isHookEnabled,
    safeHookEnabled,
  )

  // OUTLIER: Version-check gate - auto-disabled when native OpenCode support detected
  let directoryAgentsInjector: ReturnType<typeof createDirectoryAgentsInjectorHook> | null = null
  if (isHookEnabled("directory-agents-injector")) {
    const currentVersion = getOpenCodeVersion()
    const hasNativeSupport =
      currentVersion !== null && isOpenCodeVersionAtLeast(OPENCODE_NATIVE_AGENTS_INJECTION_VERSION)
    if (hasNativeSupport) {
      log("directory-agents-injector auto-disabled due to native OpenCode support", {
        currentVersion,
        nativeVersion: OPENCODE_NATIVE_AGENTS_INJECTION_VERSION,
      })
    } else {
      directoryAgentsInjector = safeCreateHook(
        "directory-agents-injector",
        () => createDirectoryAgentsInjectorHook(ctx, modelCacheState),
        { enabled: safeHookEnabled },
      )
    }
  }

  const directoryReadmeInjector = hookSlot("directory-readme-injector", () => createDirectoryReadmeInjectorHook(ctx, modelCacheState), isHookEnabled, safeHookEnabled)

  const emptyTaskResponseDetector = hookSlot("empty-task-response-detector", () => createEmptyTaskResponseDetectorHook(ctx), isHookEnabled, safeHookEnabled)

  const rulesInjector = hookSlot("rules-injector", () => createRulesInjectorHook(ctx, modelCacheState), isHookEnabled, safeHookEnabled)

  const tasksTodowriteDisabler = hookSlot("tasks-todowrite-disabler", () => createTasksTodowriteDisablerHook({ experimental: pluginConfig.experimental }), isHookEnabled, safeHookEnabled)

  const writeExistingFileGuard = hookSlot("write-existing-file-guard", () => createWriteExistingFileGuardHook(ctx), isHookEnabled, safeHookEnabled)

  const hashlineReadEnhancer = hookSlot("hashline-read-enhancer", () => createHashlineReadEnhancerHook(ctx, { hashline_edit: { enabled: pluginConfig.hashline_edit ?? true } }), isHookEnabled, safeHookEnabled)

  const jsonErrorRecovery = hookSlot("json-error-recovery", () => createJsonErrorRecoveryHook(ctx), isHookEnabled, safeHookEnabled)

  const readImageResizer = hookSlot("read-image-resizer", () => createReadImageResizerHook(ctx), isHookEnabled, safeHookEnabled)

  return {
    commentChecker,
    toolOutputTruncator,
    directoryAgentsInjector,
    directoryReadmeInjector,
    emptyTaskResponseDetector,
    rulesInjector,
    tasksTodowriteDisabler,
    writeExistingFileGuard,
    hashlineReadEnhancer,
    jsonErrorRecovery,
    readImageResizer,
  }
}
