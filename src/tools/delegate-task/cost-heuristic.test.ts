declare const require: (name: string) => unknown
const { describe, test, expect } = require("bun:test") as {
  describe: (name: string, fn: () => void) => void
  test: (name: string, fn: () => void) => void
  expect: (value: unknown) => {
    toBe: (expected: unknown) => void
    toContain: (expected: string) => void
  }
}

import { shouldDelegateOrInline } from "./cost-heuristic"

describe("shouldDelegateOrInline", () => {
  describe("#given quick category with a tiny single-file task", () => {
    describe("#when heuristic is evaluated", () => {
      test("#then it suggests inline execution", () => {
        const result = shouldDelegateOrInline({
          category: "quick",
          prompt: "fix typo",
          fileCount: 1,
        })

        expect(result.decision).toBe("suggest-inline")
        expect(result.estimatedOverhead).toBe(3500)
        expect(result.reason).toContain("quick")
      })
    })
  })

  describe("#given deep category with a tiny prompt", () => {
    describe("#when heuristic is evaluated", () => {
      test("#then it always delegates", () => {
        const result = shouldDelegateOrInline({
          category: "deep",
          prompt: "fix typo",
          fileCount: 1,
        })

        expect(result.decision).toBe("delegate")
        expect(result.estimatedOverhead).toBe(3500)
        expect(result.reason).toContain("always")
      })
    })
  })

  describe("#given a multi-file task", () => {
    describe("#when fileCount is three or more", () => {
      test("#then it delegates regardless of category", () => {
        const result = shouldDelegateOrInline({
          category: "unspecified-high",
          prompt: "refactor error handling",
          fileCount: 5,
        })

        expect(result.decision).toBe("delegate")
        expect(result.reason).toContain("file")
      })
    })
  })

  describe("#given quick category with long prompt and multiple files", () => {
    describe("#when prompt token estimate is above 500 and fileCount is greater than one", () => {
      test("#then it delegates", () => {
        const longPrompt = "a".repeat(2001)
        const result = shouldDelegateOrInline({
          category: "quick",
          prompt: longPrompt,
          fileCount: 2,
        })

        expect(result.decision).toBe("delegate")
        expect(result.reason).toContain("token")
      })
    })
  })
})
