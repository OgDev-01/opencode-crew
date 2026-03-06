import { beforeEach, describe, expect, test } from "bun:test"
import { createMemoryPreCompactionFlushHook } from "./hook"
import type { AutoCaptureConfig } from "../../config/schema/memory"

describe("memory-pre-compaction-flush hook", () => {
  let onIdleCalled: number
  let onIdle: () => Promise<void>

  beforeEach(() => {
    onIdleCalled = 0
    onIdle = async () => {
      onIdleCalled++
    }
  })

  describe("#given pre_compaction_flush is enabled (default)", () => {
    test("flush() calls onIdle() once", async () => {
      //#given
      const hook = createMemoryPreCompactionFlushHook({ onIdle })

      //#when
      await hook.flush()

      //#then
      expect(onIdleCalled).toBe(1)
    })
  })

  describe("#given pre_compaction_flush is explicitly true", () => {
    test("flush() calls onIdle()", async () => {
      //#given
      const autoCapture: AutoCaptureConfig = {
        enabled: true,
        on_success: true,
        on_failure: true,
        decision_detection: true,
        pre_compaction_flush: true,
        capture_tools: [],
        skip_tools: ["Read", "Glob", "Grep"],
        patterns: [],
      }
      const hook = createMemoryPreCompactionFlushHook({ onIdle, autoCapture })

      //#when
      await hook.flush()

      //#then
      expect(onIdleCalled).toBe(1)
    })
  })

  describe("#given pre_compaction_flush is false", () => {
    test("flush() does NOT call onIdle()", async () => {
      //#given
      const autoCapture: AutoCaptureConfig = {
        enabled: true,
        on_success: true,
        on_failure: true,
        decision_detection: true,
        pre_compaction_flush: false,
        capture_tools: [],
        skip_tools: ["Read", "Glob", "Grep"],
        patterns: [],
      }
      const hook = createMemoryPreCompactionFlushHook({ onIdle, autoCapture })

      //#when
      await hook.flush()

      //#then
      expect(onIdleCalled).toBe(0)
    })
  })

  describe("#given onIdle throws an error", () => {
    test("flush() does NOT propagate error (fire-and-forget)", async () => {
      //#given
      const throwingOnIdle = async () => {
        throw new Error("DB connection lost")
      }
      const hook = createMemoryPreCompactionFlushHook({ onIdle: throwingOnIdle })

      //#when + #then
      await expect(hook.flush()).resolves.toBeUndefined()
    })
  })

  describe("#given no autoCapture config (undefined)", () => {
    test("flush() calls onIdle() (default enabled)", async () => {
      //#given
      const hook = createMemoryPreCompactionFlushHook({ onIdle, autoCapture: undefined })

      //#when
      await hook.flush()

      //#then
      expect(onIdleCalled).toBe(1)
    })
  })
})
