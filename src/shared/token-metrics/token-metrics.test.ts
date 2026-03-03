import { beforeEach, describe, expect, it, spyOn } from "bun:test"
import {
  estimateTokensForContent,
  getTokenBreakdown,
  logTokenUsage,
  resetMetrics,
} from "./index"
import * as logger from "../logger"

let logSpy: ReturnType<typeof spyOn>

describe("#given token-metrics module", () => {
  beforeEach(() => {
    resetMetrics()
    logSpy?.mockRestore()
    logSpy = spyOn(logger, "log").mockImplementation(() => {})
  })

  describe("#when estimateTokensForContent is called with hello world", () => {
    it("#then returns 3 using chars over 4 ceiling heuristic", () => {
      const content = "hello world"

      const tokens = estimateTokensForContent(content)

      expect(tokens).toBe(3)
    })
  })

  describe("#when logTokenUsage is called with enabled true", () => {
    it("#then logs usage and records source totals", () => {
      const source = "hook-a"
      const content = "hello world"

      logTokenUsage(source, content, { enabled: true })

      expect(logSpy).toHaveBeenCalledTimes(1)
      expect(logSpy).toHaveBeenCalledWith("[token-metrics] token usage", {
        source,
        estimated_tokens: 3,
      })
      expect(getTokenBreakdown().get(source)).toBe(3)
    })
  })

  describe("#when getTokenBreakdown is called after multiple logTokenUsage calls", () => {
    it("#then returns source totals in a map", () => {
      logTokenUsage("source-a", "hello", { enabled: true })
      logTokenUsage("source-a", "world", { enabled: true })
      logTokenUsage("source-b", "abcd", { enabled: true })

      const breakdown = getTokenBreakdown()

      expect(breakdown.get("source-a")).toBe(4)
      expect(breakdown.get("source-b")).toBe(1)
      expect(breakdown.size).toBe(2)
    })
  })

  describe("#when resetMetrics is called after tracking data", () => {
    it("#then clears all recorded token breakdown entries", () => {
      logTokenUsage("source-a", "hello world", { enabled: true })

      resetMetrics()

      expect(getTokenBreakdown().size).toBe(0)
    })
  })

  describe("#when logTokenUsage is called with enabled = false", () => {
    it("#then does nothing with no logs and no side effects", () => {
      const source = "source-disabled"
      const content = "hello world"

      logTokenUsage(source, content, { enabled: false })

      expect(logSpy).not.toHaveBeenCalled()
      expect(getTokenBreakdown().size).toBe(0)
    })
  })
})
