import type { AutoCaptureConfig } from "@/config/schema/memory"
import { log } from "@/shared/logger"

export interface MemoryPreCompactionFlushDeps {
  onIdle: () => Promise<void>
  autoCapture?: AutoCaptureConfig
}

export function createMemoryPreCompactionFlushHook(deps: MemoryPreCompactionFlushDeps) {
  return {
    async flush(): Promise<void> {
      if (deps.autoCapture?.pre_compaction_flush === false) return

      try {
        await deps.onIdle()
      } catch (error) {
        log("[memory-pre-compaction-flush] Failed to flush pending memories", {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }
}
