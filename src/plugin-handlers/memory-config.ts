import { resolve } from "node:path"
import { homedir } from "node:os"
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
      similarity_threshold: memConfig?.similarity_threshold ?? 0.7,
      max_golden_rules_injected: memConfig?.max_golden_rules_injected ?? 5,
      max_learnings_injected: memConfig?.max_learnings_injected ?? 10,
      max_injection_tokens: memConfig?.max_injection_tokens ?? 500,
      ttl_learnings_days: memConfig?.ttl_learnings_days ?? 60,
      golden_rule_confidence_threshold: memConfig?.golden_rule_confidence_threshold ?? 0.9,
      golden_rule_validation_count: memConfig?.golden_rule_validation_count ?? 10,
      project_db_path: resolveDbPath(memConfig?.project_db_path ?? ".opencode/elf/memory.db", projectRoot),
      global_db_path: resolveDbPath(memConfig?.global_db_path ?? "~/.opencode/elf/memory.db", projectRoot),
      dynamic_prompts_enabled: memConfig?.dynamic_prompts_enabled ?? true,
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
  if (dbPath.startsWith("~/")) return resolve(homedir(), dbPath.slice(2))
  if (dbPath.startsWith("/")) return dbPath
  const base = projectRoot ?? process.cwd()
  return resolve(base, dbPath)
}
