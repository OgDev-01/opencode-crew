import type {
  ICleanupService,
  IConsolidationService,
  IMemorySearch,
  IMemoryStorage,
  MemoryConfig,
} from "./types"
import { initializeDatabase } from "./db/client"
import { createMemoryStorage } from "./storage/memory-storage"
import { createSearchService } from "./search/search-service"
import { createCleanupService } from "./cleanup/cleanup-service"
import { createConsolidationService } from "./consolidation/consolidator"
import {
  batchUpdateScores,
  applyTemporalDecay,
  isEvictionCandidate,
} from "./scoring/utility-scorer"
import { log } from "@/shared/logger"

export interface MemoryManager {
  readonly storage: IMemoryStorage
  readonly search: IMemorySearch
  readonly scorer: { batchUpdateScores: typeof batchUpdateScores }
  readonly consolidator: IConsolidationService
  readonly cleanup: ICleanupService
  onSessionStart(sessionId: string): Promise<void>
  onSessionEnd(sessionId: string): Promise<void>
  onIdle(): Promise<void>
  isInitialized(): boolean
}

let instance: MemoryManager | null = null

export function getMemoryManager(): MemoryManager {
  if (!instance) {
    throw new Error(
      "Memory manager not initialized. Call createMemoryManager() first."
    )
  }
  return instance
}

export function createMemoryManager(config: MemoryConfig): MemoryManager {
  if (instance) return instance
  instance = buildManager(config)
  return instance
}

export function resetMemoryManager(): void {
  instance = null
}

function buildManager(config: MemoryConfig): MemoryManager {
  let initialized = false
  let storageService: IMemoryStorage | null = null
  let searchService: IMemorySearch | null = null
  let consolidationService: IConsolidationService | null = null
  let cleanupService: ICleanupService | null = null

  function ensureInitialized(): void {
    if (initialized) return
    const dbPath = config.scope === "global"
      ? config.global_db_path ?? config.project_db_path ?? ":memory:"
      : config.project_db_path ?? ":memory:"
    const db = initializeDatabase(dbPath)
    storageService = createMemoryStorage(db)
    searchService = createSearchService(db)
    consolidationService = createConsolidationService(
      storageService,
      searchService,
      {
        minConfidence: config.golden_rule_confidence_threshold,
        minValidationCount: config.golden_rule_validation_count,
      }
    )
    cleanupService = createCleanupService(
      storageService,
      { applyTemporalDecay, isEvictionCandidate },
      db,
      { learningTtlDays: config.ttl_learnings_days }
    )
    initialized = true
    log("[memory] Services initialized")
  }

  const manager: MemoryManager = {
    get storage(): IMemoryStorage {
      ensureInitialized()
      return storageService!
    },
    get search(): IMemorySearch {
      ensureInitialized()
      return searchService!
    },
    get scorer() {
      return { batchUpdateScores }
    },
    get consolidator(): IConsolidationService {
      ensureInitialized()
      return consolidationService!
    },
    get cleanup(): ICleanupService {
      ensureInitialized()
      return cleanupService!
    },

    async onSessionStart(sessionId: string): Promise<void> {
      try {
        ensureInitialized()
        log("[memory] Session started", { sessionId })
        await cleanupService!.cleanup()
      } catch (error) {
        log("[memory] onSessionStart error (non-fatal)", { error, sessionId })
      }
    },

    async onSessionEnd(sessionId: string): Promise<void> {
      if (!initialized) return
      try {
        log("[memory] Session ended", { sessionId })
        await consolidationService!.consolidate(config.scope)
      } catch (error) {
        log("[memory] onSessionEnd error (non-fatal)", { error, sessionId })
      }
    },

    async onIdle(): Promise<void> {
      if (!initialized) return
      try {
        log("[memory] Idle — running opportunistic maintenance")
        await cleanupService!.cleanup()
        await consolidationService!.consolidate(config.scope)
      } catch (error) {
        log("[memory] onIdle error (non-fatal)", { error })
      }
    },

    isInitialized(): boolean {
      return initialized
    },
  }

  return manager
}
