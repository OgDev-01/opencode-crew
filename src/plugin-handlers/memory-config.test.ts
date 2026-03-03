import { resolve } from "node:path"
import { describe, test, expect, mock } from "bun:test"
import { applyMemoryConfig } from "./memory-config"
import type { OpenCodeCrewConfig } from "../config"

const TEST_PROJECT_ROOT = "/fake/project"

describe("applyMemoryConfig", () => {
  describe("#given no memory config", () => {
    describe("#when applyMemoryConfig called", () => {
      test("#then createMemoryManager called with default config including resolved project_db_path", () => {
        const config: OpenCodeCrewConfig = {}
        const mockCreateMemoryManager = mock(() => {})

        applyMemoryConfig(config, TEST_PROJECT_ROOT, mockCreateMemoryManager)

        expect(mockCreateMemoryManager).toHaveBeenCalled()
        const call = mockCreateMemoryManager.mock.calls[0]
        expect(call[0]).toEqual({
          enabled: true,
          scope: "project",
          max_learnings: 1000,
          max_golden_rules: 500,
          consolidation_threshold: 0.7,
          cleanup_threshold: 100,
          retention_days: 90,
          project_db_path: resolve(TEST_PROJECT_ROOT, ".opencode/elf/memory.db"),
        })
      })
    })
  })

  describe("#given memory.enabled = false", () => {
    describe("#when applyMemoryConfig called", () => {
      test("#then createMemoryManager NOT called", () => {
        const config: OpenCodeCrewConfig = {
          memory: { enabled: false },
        }
        const mockCreateMemoryManager = mock(() => {})

        applyMemoryConfig(config, TEST_PROJECT_ROOT, mockCreateMemoryManager)

        expect(mockCreateMemoryManager).not.toHaveBeenCalled()
      })
    })
  })

  describe("#given memory enabled with custom setting", () => {
    describe("#when applyMemoryConfig called", () => {
      test("#then createMemoryManager receives correct config", () => {
        const pluginConfig: OpenCodeCrewConfig = {
          memory: {
            enabled: true,
          },
        }
        const mockCreateMemoryManager = mock(() => {})

        applyMemoryConfig(pluginConfig, TEST_PROJECT_ROOT, mockCreateMemoryManager)

        expect(mockCreateMemoryManager).toHaveBeenCalled()
        const call = mockCreateMemoryManager.mock.calls[0]
        expect(call[0]?.enabled).toBe(true)
        expect(call[0]?.scope).toBe("project")
        expect(call[0]?.project_db_path).toBe(resolve(TEST_PROJECT_ROOT, ".opencode/elf/memory.db"))
      })
    })
  })

  describe("#given memory config with custom scope", () => {
    describe("#when applyMemoryConfig called", () => {
      test("#then createMemoryManager receives correct config with scope", () => {
        const pluginConfig: OpenCodeCrewConfig = {
          memory: {
            enabled: true,
            scope: "global" as const,
          },
        }
        const mockCreateMemoryManager = mock(() => {})

        applyMemoryConfig(pluginConfig, TEST_PROJECT_ROOT, mockCreateMemoryManager)

        expect(mockCreateMemoryManager).toHaveBeenCalled()
        const call = mockCreateMemoryManager.mock.calls[0]
        expect(call[0]?.scope).toBe("global")
      })
    })
  })

  describe("#given custom project_db_path", () => {
    describe("#when path is relative", () => {
      test("#then resolves relative to projectRoot", () => {
        const pluginConfig: OpenCodeCrewConfig = {
          memory: {
            enabled: true,
            project_db_path: "custom/memory.db",
          },
        }
        const mockCreateMemoryManager = mock(() => {})

        applyMemoryConfig(pluginConfig, TEST_PROJECT_ROOT, mockCreateMemoryManager)

        const call = mockCreateMemoryManager.mock.calls[0]
        expect(call[0]?.project_db_path).toBe(resolve(TEST_PROJECT_ROOT, "custom/memory.db"))
      })
    })

    describe("#when path is absolute", () => {
      test("#then uses absolute path as-is", () => {
        const pluginConfig: OpenCodeCrewConfig = {
          memory: {
            enabled: true,
            project_db_path: "/absolute/path/memory.db",
          },
        }
        const mockCreateMemoryManager = mock(() => {})

        applyMemoryConfig(pluginConfig, TEST_PROJECT_ROOT, mockCreateMemoryManager)

        const call = mockCreateMemoryManager.mock.calls[0]
        expect(call[0]?.project_db_path).toBe("/absolute/path/memory.db")
      })
    })
  })

  describe("#given no projectRoot provided", () => {
    describe("#when applyMemoryConfig called", () => {
      test("#then resolves relative to process.cwd()", () => {
        const pluginConfig: OpenCodeCrewConfig = {}
        const mockCreateMemoryManager = mock(() => {})

        applyMemoryConfig(pluginConfig, undefined, mockCreateMemoryManager)

        const call = mockCreateMemoryManager.mock.calls[0]
        expect(call[0]?.project_db_path).toBe(resolve(process.cwd(), ".opencode/elf/memory.db"))
      })
    })
  })

  describe("#given createMemoryManager throws error", () => {
    describe("#when applyMemoryConfig called", () => {
      test("#then does NOT throw", () => {
        const config: OpenCodeCrewConfig = {
          memory: { enabled: true },
        }
        const mockCreateMemoryManager = mock(() => {
          throw new Error("Initialization failed")
        })

        expect(() => applyMemoryConfig(config, TEST_PROJECT_ROOT, mockCreateMemoryManager)).not.toThrow()
      })
    })
  })
})
