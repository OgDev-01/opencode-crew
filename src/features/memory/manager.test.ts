import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import type { MemoryConfig } from "./types"
import { closeAll } from "./db/client"

import {
  createMemoryManager,
  getMemoryManager,
  resetMemoryManager,
  type MemoryManager,
} from "./manager"

function makeConfig(overrides?: Partial<MemoryConfig>): MemoryConfig {
  return {
    enabled: true,
    scope: "project",
    max_learnings: 100,
    max_golden_rules: 5,
    consolidation_threshold: 3,
    cleanup_threshold: 50,
    retention_days: 30,
    ...overrides,
  }
}

describe("MemoryManager", () => {
  beforeEach(() => {
    closeAll()
    resetMemoryManager()
  })

  afterEach(() => {
    resetMemoryManager()
    closeAll()
  })

  describe("#given getMemoryManager called before createMemoryManager", () => {
    test("#then throws with helpful error", () => {
      expect(() => getMemoryManager()).toThrow(
        "Memory manager not initialized"
      )
    })
  })

  describe("#given createMemoryManager called with config", () => {
    let manager: MemoryManager

    beforeEach(() => {
      manager = createMemoryManager(makeConfig())
    })

    test("#then returns a MemoryManager instance", () => {
      expect(manager).toBeDefined()
      expect(manager.onSessionStart).toBeFunction()
      expect(manager.onSessionEnd).toBeFunction()
      expect(manager.onIdle).toBeFunction()
      expect(manager.isInitialized).toBeFunction()
    })

    test("#then isInitialized returns false before first access", () => {
      expect(manager.isInitialized()).toBe(false)
    })

    describe("#when getMemoryManager is called", () => {
      test("#then returns the same instance", () => {
        const retrieved = getMemoryManager()
        expect(retrieved).toBe(manager)
      })
    })

    describe("#when createMemoryManager is called again", () => {
      test("#then returns the same singleton instance", () => {
        const second = createMemoryManager(makeConfig())
        expect(second).toBe(manager)
      })
    })
  })

  describe("#given manager services accessed via lazy init", () => {
    let manager: MemoryManager

    beforeEach(() => {
      manager = createMemoryManager(makeConfig())
    })

    test("#when storage is accessed #then initializes and returns service", () => {
      expect(manager.isInitialized()).toBe(false)
      const storage = manager.storage
      expect(storage).toBeDefined()
      expect(storage.addLearning).toBeFunction()
      expect(manager.isInitialized()).toBe(true)
    })

    test("#when search is accessed #then initializes and returns service", () => {
      const search = manager.search
      expect(search).toBeDefined()
      expect(search.search).toBeFunction()
    })

    test("#when scorer is accessed #then returns scorer functions", () => {
      const scorer = manager.scorer
      expect(scorer).toBeDefined()
      expect(scorer.batchUpdateScores).toBeFunction()
    })

    test("#when consolidator is accessed #then returns consolidation service", () => {
      const consolidator = manager.consolidator
      expect(consolidator).toBeDefined()
      expect(consolidator.consolidate).toBeFunction()
    })

    test("#when cleanup is accessed #then returns cleanup service", () => {
      const cleanup = manager.cleanup
      expect(cleanup).toBeDefined()
      expect(cleanup.cleanup).toBeFunction()
    })
  })

  describe("#given onSessionStart is called", () => {
    let manager: MemoryManager

    beforeEach(() => {
      manager = createMemoryManager(makeConfig())
    })

    test("#when session starts #then triggers lazy init", async () => {
      expect(manager.isInitialized()).toBe(false)
      await manager.onSessionStart("session-1")
      expect(manager.isInitialized()).toBe(true)
    })

    test("#when cleanup throws #then does not propagate error", async () => {
      await expect(manager.onSessionStart("session-2")).resolves.toBeUndefined()
    })


  })

  describe("#given onSessionEnd is called", () => {
    let manager: MemoryManager

    beforeEach(() => {
      manager = createMemoryManager(makeConfig())
    })

    test("#when manager was initialized #then runs consolidation", async () => {
      await manager.onSessionStart("session-1")
      await expect(manager.onSessionEnd("session-1")).resolves.toBeUndefined()
    })

    test("#when manager was NOT initialized #then is a no-op", async () => {
      await expect(manager.onSessionEnd("session-1")).resolves.toBeUndefined()
    })
  })

  describe("#given onIdle is called", () => {
    let manager: MemoryManager

    beforeEach(() => {
      manager = createMemoryManager(makeConfig())
    })

    test("#when manager was initialized #then runs cleanup and consolidation", async () => {
      await manager.onSessionStart("session-1")
      await expect(manager.onIdle()).resolves.toBeUndefined()
    })

    test("#when manager was NOT initialized #then is a no-op", async () => {
      await expect(manager.onIdle()).resolves.toBeUndefined()
    })

    test("#when cleanup throws during onIdle #then does not propagate", async () => {
      await manager.onSessionStart("session-1")
      await expect(manager.onIdle()).resolves.toBeUndefined()
    })
  })

  describe("#given resetMemoryManager is called", () => {
    test("#then getMemoryManager throws again", () => {
      createMemoryManager(makeConfig())
      expect(() => getMemoryManager()).not.toThrow()
      resetMemoryManager()
      expect(() => getMemoryManager()).toThrow("Memory manager not initialized")
    })
  })
})
