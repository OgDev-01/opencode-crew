import { resolve } from "node:path"
import { homedir } from "node:os"
import { describe, test, expect, mock } from "bun:test"
import { applyMemoryConfig } from "./memory-config"
import type { OpenCodeCrewConfig } from "../config"
import { MemoryConfigSchema } from "../config/schema/memory"
import { batchUpdateScores } from "../features/memory/scoring/utility-scorer"
import type { MemoryManager } from "../features/memory/manager"
import type { IMemorySearch, IMemoryStorage } from "../features/memory/types"
import type { ICleanupService } from "../features/memory/cleanup/cleanup-service"
import type { IConsolidationService } from "../features/memory/consolidation/consolidator"

const TEST_PROJECT_ROOT = "/fake/project"

function createMockManager(): MemoryManager {
  const storage: IMemoryStorage = {
    addLearning: async () => {},
    getLearning: async () => null,
    getLearningsByScope: async () => [],
    updateLearning: async () => {},
    deleteLearning: async () => {},
    addGoldenRule: async () => {},
    getGoldenRules: async () => [],
    getGoldenRulesByScope: async () => [],
    deleteGoldenRule: async () => {},
    getStats: async () => ({ learnings: 0, goldenRules: 0 }),
  }
  const search: IMemorySearch = {
    search: async () => [],
    searchLearnings: async () => [],
  }
  const consolidator: IConsolidationService = {
    consolidate: async () => ({ promoted: 0, synthesized: 0, evicted: 0 }),
    consolidateAll: async () => ({ promoted: 0, synthesized: 0, evicted: 0 }),
  }
  const cleanup: ICleanupService = {
    cleanup: async () => ({ expired: 0, evicted: 0, total_freed: 0 }),
  }

  return {
    get storage() {
      return storage
    },
    get search() {
      return search
    },
    get scorer() {
      return { batchUpdateScores }
    },
    get consolidator() {
      return consolidator
    },
    get cleanup() {
      return cleanup
    },
    async onSessionStart() {},
    async onSessionEnd() {},
    async onIdle() {},
    isInitialized() {
      return true
    },
  }
}

function createPluginConfig(memoryOverrides?: Partial<NonNullable<OpenCodeCrewConfig["memory"]>>): OpenCodeCrewConfig {
  return memoryOverrides
    ? { memory: MemoryConfigSchema.parse(memoryOverrides) }
    : {}
}

describe("applyMemoryConfig", () => {
  describe("#given no memory config", () => {
    describe("#when applyMemoryConfig called", () => {
      test("#then createMemoryManager called with default config including resolved project_db_path", () => {
        const config = createPluginConfig()
        const mockCreateMemoryManager = mock(() => createMockManager())

        applyMemoryConfig(config, TEST_PROJECT_ROOT, mockCreateMemoryManager)

        expect(mockCreateMemoryManager).toHaveBeenCalledWith({
          enabled: true,
          scope: "project",
          max_learnings: 1000,
          max_golden_rules: 500,
          consolidation_threshold: 0.7,
          cleanup_threshold: 100,
          retention_days: 90,
          similarity_threshold: 0.7,
          max_golden_rules_injected: 5,
          max_learnings_injected: 10,
          max_injection_tokens: 500,
          ttl_learnings_days: 60,
          golden_rule_confidence_threshold: 0.9,
          golden_rule_validation_count: 10,
          project_db_path: resolve(TEST_PROJECT_ROOT, ".opencode/elf/memory.db"),
          global_db_path: resolve(homedir(), ".opencode/elf/memory.db"),
          dynamic_prompts_enabled: true,
        })
      })
    })
  })

  describe("#given memory.enabled = false", () => {
    describe("#when applyMemoryConfig called", () => {
      test("#then createMemoryManager NOT called", () => {
        const config = createPluginConfig({ enabled: false })
        const mockCreateMemoryManager = mock(() => createMockManager())

        applyMemoryConfig(config, TEST_PROJECT_ROOT, mockCreateMemoryManager)

        expect(mockCreateMemoryManager).not.toHaveBeenCalled()
      })
    })
  })

  describe("#given memory enabled with custom setting", () => {
    describe("#when applyMemoryConfig called", () => {
      test("#then createMemoryManager receives correct config", () => {
        const pluginConfig = createPluginConfig({ enabled: true })
        const mockCreateMemoryManager = mock(() => createMockManager())

        applyMemoryConfig(pluginConfig, TEST_PROJECT_ROOT, mockCreateMemoryManager)

        expect(mockCreateMemoryManager).toHaveBeenCalledWith(
          expect.objectContaining({
            enabled: true,
            scope: "project",
            project_db_path: resolve(TEST_PROJECT_ROOT, ".opencode/elf/memory.db"),
          })
        )
      })
    })
  })

  describe("#given memory config with custom scope", () => {
    describe("#when applyMemoryConfig called", () => {
      test("#then createMemoryManager receives correct config with scope", () => {
        const pluginConfig = createPluginConfig({ enabled: true, scope: "global" })
        const mockCreateMemoryManager = mock(() => createMockManager())

        applyMemoryConfig(pluginConfig, TEST_PROJECT_ROOT, mockCreateMemoryManager)

        expect(mockCreateMemoryManager).toHaveBeenCalledWith(
          expect.objectContaining({ scope: "global" })
        )
      })
    })
  })

  describe("#given custom project_db_path", () => {
    describe("#when path is relative", () => {
      test("#then resolves relative to projectRoot", () => {
        const pluginConfig = createPluginConfig({ enabled: true, project_db_path: "custom/memory.db" })
        const mockCreateMemoryManager = mock(() => createMockManager())

        applyMemoryConfig(pluginConfig, TEST_PROJECT_ROOT, mockCreateMemoryManager)

        expect(mockCreateMemoryManager).toHaveBeenCalledWith(
          expect.objectContaining({ project_db_path: resolve(TEST_PROJECT_ROOT, "custom/memory.db") })
        )
      })
    })

    describe("#when path is absolute", () => {
      test("#then uses absolute path as-is", () => {
        const pluginConfig = createPluginConfig({ enabled: true, project_db_path: "/absolute/path/memory.db" })
        const mockCreateMemoryManager = mock(() => createMockManager())

        applyMemoryConfig(pluginConfig, TEST_PROJECT_ROOT, mockCreateMemoryManager)

        expect(mockCreateMemoryManager).toHaveBeenCalledWith(
          expect.objectContaining({ project_db_path: "/absolute/path/memory.db" })
        )
      })
    })
  })

  describe("#given global scope with custom global_db_path", () => {
    describe("#when applyMemoryConfig called", () => {
      test("#then createMemoryManager receives resolved global db path", () => {
        const pluginConfig = createPluginConfig({
          enabled: true,
          scope: "global",
          global_db_path: "shared/global-memory.db",
        })
        const mockCreateMemoryManager = mock(() => createMockManager())

        applyMemoryConfig(pluginConfig, TEST_PROJECT_ROOT, mockCreateMemoryManager)

        expect(mockCreateMemoryManager).toHaveBeenCalledWith(
          expect.objectContaining({
            scope: "global",
            global_db_path: resolve(TEST_PROJECT_ROOT, "shared/global-memory.db"),
          })
        )
      })
    })
  })

  describe("#given no projectRoot provided", () => {
    describe("#when applyMemoryConfig called", () => {
      test("#then resolves relative to process.cwd()", () => {
        const pluginConfig: OpenCodeCrewConfig = {}
        const mockCreateMemoryManager = mock(() => createMockManager())

        applyMemoryConfig(pluginConfig, undefined, mockCreateMemoryManager)

        expect(mockCreateMemoryManager).toHaveBeenCalledWith(
          expect.objectContaining({ project_db_path: resolve(process.cwd(), ".opencode/elf/memory.db") })
        )
      })
    })
  })

  describe("#given createMemoryManager throws error", () => {
    describe("#when applyMemoryConfig called", () => {
      test("#then does NOT throw", () => {
        const config = createPluginConfig({ enabled: true })
        const mockCreateMemoryManager = mock(() => {
          throw new Error("Initialization failed")
        })

        expect(() => applyMemoryConfig(config, TEST_PROJECT_ROOT, mockCreateMemoryManager)).not.toThrow()
      })
    })
  })
})
