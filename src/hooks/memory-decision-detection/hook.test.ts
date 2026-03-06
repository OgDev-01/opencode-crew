import { beforeEach, describe, expect, test } from "bun:test"
import { subagentSessions } from "../../features/claude-code-session-state"
import type { GoldenRule, IMemoryStorage, Learning } from "../../features/memory/types"
import { createMemoryDecisionDetectionHook } from "./hook"

function createMockStorage(): IMemoryStorage & { goldenRules: GoldenRule[] } {
  const goldenRules: GoldenRule[] = []
  return {
    goldenRules,
    async addLearning(_learning: Learning) {},
    async getLearning(_id: string) {
      return null
    },
    async getLearningsByScope(_scope) {
      return []
    },
    async updateLearning(_id: string, _updates: Partial<Learning>) {},
    async deleteLearning(_id: string) {},
    async addGoldenRule(rule: GoldenRule) {
      goldenRules.push(rule)
    },
    async getGoldenRules() {
      return goldenRules
    },
    async getGoldenRulesByScope(_scope) {
      return goldenRules
    },
    async deleteGoldenRule(_id: string) {},
    async getStats() {
      return { learnings: 0, goldenRules: goldenRules.length }
    },
  }
}

describe("memory-decision-detection hook", () => {
  let storage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    storage = createMockStorage()
    subagentSessions.clear()
  })

  describe("#given user says let's use TypeScript", () => {
    test("captures golden rule with confidence 0.8", async () => {
      //#given
      const hook = createMemoryDecisionDetectionHook({ storage })

      //#when
      await hook["chat.message"](
        { sessionID: "ses_1" },
        {
          message: { role: "user" },
          parts: [{ type: "text", text: "let's use TypeScript" }],
        }
      )

      //#then
      expect(storage.goldenRules).toHaveLength(1)
      expect(storage.goldenRules[0].rule).toBe("Preference: Let's use TypeScript")
      expect(storage.goldenRules[0].confidence).toBe(0.8)
      expect(storage.goldenRules[0].domain).toBe("session")
    })
  })

  describe("#given user says never commit without tests", () => {
    test("captures golden rule", async () => {
      //#given
      const hook = createMemoryDecisionDetectionHook({ storage })

      //#when
      await hook["chat.message"](
        { sessionID: "ses_2" },
        {
          message: { role: "user" },
          parts: [{ type: "text", text: "never commit without tests" }],
        }
      )

      //#then
      expect(storage.goldenRules).toHaveLength(1)
      expect(storage.goldenRules[0].rule).toContain("Never commit without tests")
    })
  })

  describe("#given user says I prefer tabs over spaces", () => {
    test("captures golden rule", async () => {
      //#given
      const hook = createMemoryDecisionDetectionHook({ storage })

      //#when
      await hook["chat.message"](
        { sessionID: "ses_3" },
        {
          message: { role: "user" },
          parts: [{ type: "text", text: "I prefer tabs over spaces" }],
        }
      )

      //#then
      expect(storage.goldenRules).toHaveLength(1)
      expect(storage.goldenRules[0].rule).toContain("I prefer tabs over spaces")
    })
  })

  describe("#given user says what should we use?", () => {
    test("does NOT capture golden rule", async () => {
      //#given
      const hook = createMemoryDecisionDetectionHook({ storage })

      //#when
      await hook["chat.message"](
        { sessionID: "ses_4" },
        {
          message: { role: "user" },
          parts: [{ type: "text", text: "what should we use?" }],
        }
      )

      //#then
      expect(storage.goldenRules).toHaveLength(0)
    })
  })

  describe("#given user says hello world", () => {
    test("does NOT capture golden rule", async () => {
      //#given
      const hook = createMemoryDecisionDetectionHook({ storage })

      //#when
      await hook["chat.message"](
        { sessionID: "ses_5" },
        {
          message: { role: "user" },
          parts: [{ type: "text", text: "hello world" }],
        }
      )

      //#then
      expect(storage.goldenRules).toHaveLength(0)
    })
  })

  describe("#given assistant message", () => {
    test("does NOT capture golden rule", async () => {
      //#given
      const hook = createMemoryDecisionDetectionHook({ storage })

      //#when
      await hook["chat.message"](
        { sessionID: "ses_6" },
        {
          message: { role: "assistant" },
          parts: [{ type: "text", text: "we should use TypeScript" }],
        }
      )

      //#then
      expect(storage.goldenRules).toHaveLength(0)
    })
  })

  describe("#given duplicate decision in same session", () => {
    test("deduplicates and stores only one golden rule", async () => {
      //#given
      const hook = createMemoryDecisionDetectionHook({ storage })
      const output = {
        message: { role: "user" },
        parts: [{ type: "text", text: "always use TypeScript" }],
      }

      //#when
      await hook["chat.message"]({ sessionID: "ses_7" }, output)
      await hook["chat.message"]({ sessionID: "ses_7" }, output)

      //#then
      expect(storage.goldenRules).toHaveLength(1)
    })
  })

  describe("#given auto_capture.decision_detection=false", () => {
    test("skips detection entirely", async () => {
      //#given
      const hook = createMemoryDecisionDetectionHook({
        storage,
        autoCapture: {
          enabled: true,
          on_success: true,
          on_failure: true,
          decision_detection: false,
          pre_compaction_flush: true,
          capture_tools: [],
          skip_tools: ["Read", "Glob", "Grep"],
          patterns: [],
        },
      })

      //#when
      await hook["chat.message"](
        { sessionID: "ses_8" },
        {
          message: { role: "user" },
          parts: [{ type: "text", text: "let's use TypeScript" }],
        }
      )

      //#then
      expect(storage.goldenRules).toHaveLength(0)
    })
  })

  describe("#given subagent session", () => {
    test("skips detection", async () => {
      //#given
      subagentSessions.add("ses_sub")
      const hook = createMemoryDecisionDetectionHook({ storage })

      //#when
      await hook["chat.message"](
        { sessionID: "ses_sub" },
        {
          message: { role: "user" },
          parts: [{ type: "text", text: "let's use TypeScript" }],
        }
      )

      //#then
      expect(storage.goldenRules).toHaveLength(0)
    })
  })

  describe("#given storage throws error", () => {
    test("does NOT propagate error (fire-and-forget)", async () => {
      //#given
      const throwingStorage = createMockStorage()
      throwingStorage.addGoldenRule = async () => {
        throw new Error("db unavailable")
      }
      const hook = createMemoryDecisionDetectionHook({ storage: throwingStorage })

      //#when + #then
      await expect(
        hook["chat.message"](
          { sessionID: "ses_10" },
          {
            message: { role: "user" },
            parts: [{ type: "text", text: "always use TypeScript" }],
          }
        )
      ).resolves.toBeUndefined()
    })
  })

  describe("#given privacy tags in decision text", () => {
    test("filters content before storing", async () => {
      //#given
      const hook = createMemoryDecisionDetectionHook({ storage, privacyTags: ["secret"] })

      //#when
      await hook["chat.message"](
        { sessionID: "ses_11" },
        {
          message: { role: "user" },
          parts: [{ type: "text", text: "let's use <secret>my-api-key</secret>" }],
        }
      )

      //#then
      expect(storage.goldenRules).toHaveLength(1)
      expect(storage.goldenRules[0].rule).toContain("[REDACTED]")
      expect(storage.goldenRules[0].rule).not.toContain("my-api-key")
    })
  })
})
