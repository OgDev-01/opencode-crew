import type { HookName, OpenCodeCrewConfig } from "@/config"
import type { BackgroundManager } from "@/features/background-agent"
import type { PluginContext } from "../types"

import {
  createTodoContinuationEnforcer,
  createBackgroundNotificationHook,
  createStopContinuationGuardHook,
  createCompactionContextInjector,
  createCompactionTodoPreserverHook,
  createRelayHook,
  createMemoryPreCompactionFlushHook,
} from "@/hooks"
import { hookSlot } from "./hook-slot"
import { safeCreateHook } from "@/shared/hook-utils/safe-create-hook"
import { createUnstableAgentBabysitter } from "../unstable-agent-babysitter"
import { log } from "@/shared/logger"

export type ContinuationHooks = {
  stopContinuationGuard: ReturnType<typeof createStopContinuationGuardHook> | null
  compactionContextInjector: ReturnType<typeof createCompactionContextInjector> | null
  compactionTodoPreserver: ReturnType<typeof createCompactionTodoPreserverHook> | null
  todoContinuationEnforcer: ReturnType<typeof createTodoContinuationEnforcer> | null
  unstableAgentBabysitter: ReturnType<typeof createUnstableAgentBabysitter> | null
  backgroundNotificationHook: ReturnType<typeof createBackgroundNotificationHook> | null
  relayHook: ReturnType<typeof createRelayHook> | null
  memoryPreCompactionFlush: ReturnType<typeof createMemoryPreCompactionFlushHook> | null
}

type SessionRecovery = {
  setOnAbortCallback: (callback: (sessionID: string) => void) => void
  setOnRecoveryCompleteCallback: (callback: (sessionID: string) => void) => void
} | null

export function createContinuationHooks(args: {
  ctx: PluginContext
  pluginConfig: OpenCodeCrewConfig
  isHookEnabled: (hookName: HookName) => boolean
  safeHookEnabled: boolean
  backgroundManager: BackgroundManager
  sessionRecovery: SessionRecovery
}): ContinuationHooks {
  const {
    ctx,
    pluginConfig,
    isHookEnabled,
    safeHookEnabled,
    backgroundManager,
    sessionRecovery,
  } = args

  const stopContinuationGuard = hookSlot(
    "stop-continuation-guard",
    () =>
      createStopContinuationGuardHook(ctx, {
        backgroundManager,
      }),
    isHookEnabled,
    safeHookEnabled,
  )

  const compactionContextInjector = hookSlot(
    "compaction-context-injector",
    () => createCompactionContextInjector(backgroundManager),
    isHookEnabled,
    safeHookEnabled,
  )

  const compactionTodoPreserver = hookSlot(
    "compaction-todo-preserver",
    () => createCompactionTodoPreserverHook(ctx),
    isHookEnabled,
    safeHookEnabled,
  )

  const todoContinuationEnforcer = hookSlot(
    "todo-continuation-enforcer",
    () =>
      createTodoContinuationEnforcer(ctx, {
        backgroundManager,
        isContinuationStopped: stopContinuationGuard?.isStopped,
      }),
    isHookEnabled,
    safeHookEnabled,
  )

  const unstableAgentBabysitter = hookSlot(
    "unstable-agent-babysitter",
    () => createUnstableAgentBabysitter({ ctx, backgroundManager, pluginConfig }),
    isHookEnabled,
    safeHookEnabled,
  )

  const memoryPreCompactionFlush = isHookEnabled("memory-pre-compaction-flush")
    ? safeCreateHook("memory-pre-compaction-flush", () => {
        try {
          const { getMemoryManager } = require("../../features/memory/manager")
          const manager = getMemoryManager()
          return createMemoryPreCompactionFlushHook({
            onIdle: () => manager.onIdle(),
            autoCapture: pluginConfig.memory?.auto_capture,
          })
        } catch (error) {
          log(`Failed to initialize memory-pre-compaction-flush hook: ${error instanceof Error ? error.message : String(error)}`)
          return null
        }
      }, { enabled: safeHookEnabled })
    : null


  // OUTLIER: Inter-hook wiring - continuation hooks wire to sessionRecovery callbacks after creation
  if (sessionRecovery) {
    const onAbortCallbacks: Array<(sessionID: string) => void> = []
    const onRecoveryCompleteCallbacks: Array<(sessionID: string) => void> = []

    if (todoContinuationEnforcer) {
      onAbortCallbacks.push(todoContinuationEnforcer.markRecovering)
      onRecoveryCompleteCallbacks.push(todoContinuationEnforcer.markRecoveryComplete)
    }


    if (onAbortCallbacks.length > 0) {
      sessionRecovery.setOnAbortCallback((sessionID: string) => {
        for (const callback of onAbortCallbacks) callback(sessionID)
      })
    }

    if (onRecoveryCompleteCallbacks.length > 0) {
      sessionRecovery.setOnRecoveryCompleteCallback((sessionID: string) => {
        for (const callback of onRecoveryCompleteCallbacks) callback(sessionID)
      })
    }
  }

  const backgroundNotificationHook = hookSlot(
    "background-notification",
    () => createBackgroundNotificationHook(backgroundManager),
    isHookEnabled,
    safeHookEnabled,
  )

  const relayHook = hookSlot(
    "relay",
    () =>
      createRelayHook(ctx, {
        directory: ctx.directory,
        backgroundManager,
        isContinuationStopped: (sessionID: string) =>
          stopContinuationGuard?.isStopped(sessionID) ?? false,
        agentOverrides: pluginConfig.agents,
      }),
    isHookEnabled,
    safeHookEnabled,
  )

  return {
    stopContinuationGuard,
    compactionContextInjector,
    compactionTodoPreserver,
    todoContinuationEnforcer,
    unstableAgentBabysitter,
    backgroundNotificationHook,
    relayHook,
    memoryPreCompactionFlush,
  }
}
