import { resolve } from "node:path"
import type { OpenCodeCrewConfig } from "../config"
import { createMemoryManager as defaultCreateMemoryManager } from "../features/memory/manager"
import type { MemoryConfig as MemorySystemConfig } from "../features/memory/types"
import { log } from "../shared"

export function applyMemoryConfig(
  pluginConfig: OpenCodeCrewConfig,
  projectRoot?: string,
  createMemoryManager: typeof defaultCreateMemoryManager = defaultCreateMemoryManager
): void {
  const memConfig = pluginConfig.memory

  // Default: memory enabled if no config
  if (memConfig?.enabled === false) {
    log("[memory] Memory system disabled via config")
    return
  }

  try {
    // Extract only fields expected by memory system
    const systemConfig: MemorySystemConfig = {
      enabled: memConfig?.enabled ?? true,
      scope: memConfig?.scope ?? "project",
      max_learnings: 1000,
      max_golden_rules: 500,
      consolidation_threshold: 0.7,
      cleanup_threshold: 100,
      retention_days: 90,
      project_db_path: resolveDbPath(memConfig?.project_db_path ?? ".opencode/elf/memory.db", projectRoot),
    }

    createMemoryManager(systemConfig)
    log("[memory] Memory manager initialized from config")
  } catch (error) {
    log("[memory] Failed to initialize memory manager (non-fatal)", { error })
    // Graceful degradation: memory unavailable, plugin still works
  }
}

function resolveDbPath(dbPath: string, projectRoot?: string): string {
  if (!dbPath || dbPath === ":memory:") return dbPath
  if (dbPath.startsWith("/")) return dbPath
  const base = projectRoot ?? process.cwd()
  return resolve(base, dbPath)
}
