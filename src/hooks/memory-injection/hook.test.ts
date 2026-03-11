/// <reference types="bun-types" />

import { beforeEach, describe, expect, it } from "bun:test"

import type { MemorySearchResult } from "../../features/memory/types"
import { createMemoryInjectionHook } from "./hook"
import type { MemorySearchService } from "./hook"

function createMockSearch(overrides?: Partial<MemorySearchService>): MemorySearchService {
  return {
    searchAll: async () => [],
    searchGoldenRules: async () => [],
    ...overrides,
  }
}

function createMockCollector() {
  const registered: Array<{
    sessionID: string
    id: string
    source: string
    content: string
    priority: string
    metadata?: Record<string, unknown>
  }> = []

  return {
    registered,
    register(sessionID: string, opts: { id: string; source: string; content: string; priority: string; metadata?: Record<string, unknown> }) {
      registered.push({ sessionID, ...opts })
    },
  }
}

function createConsultTracker() {
  const consulted: LearningLike[] = []
  type LearningLike = { id: string; times_consulted: number; summary: string }
  return {
    consulted,
    async record(learning: LearningLike) {
      consulted.push(learning)
    },
  }
}

type TransformOutput = { messages: Array<{ info: Record<string, unknown>; parts: Array<{ type: string; text?: string }> }> }

function msg(role: string, text: string, sessionID = "ses-1"): TransformOutput["messages"][number] {
  return {
    info: { role, sessionID },
    parts: [{ type: "text", text }],
  }
}

function goldenRuleResult(rule: string, score = 0.9): MemorySearchResult {
  return {
    entry: {
      id: `gr-${rule.slice(0, 8)}`,
      rule,
      domain: "general",
      confidence: 0.95,
      times_validated: 5,
      times_violated: 0,
      source_learning_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    score,
    type: "golden_rule",
  }
}

function learningResult(summary: string, score = 0.6): MemorySearchResult {
  return {
    entry: {
      id: `lr-${summary.slice(0, 8)}`,
      type: "observation" as const,
      summary,
      context: "test context",
      tool_name: "test",
      domain: "general",
      tags: [],
      utility_score: 0.7,
      times_consulted: 1,
      context_hash: "abc",
      confidence: 0.8,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    score,
    type: "learning",
  }
}

describe("createMemoryInjectionHook", () => {
  let mockCollector: ReturnType<typeof createMockCollector>
  let consultTracker: ReturnType<typeof createConsultTracker>

  beforeEach(() => {
    mockCollector = createMockCollector()
    consultTracker = createConsultTracker()
  })

  describe("#given subagent session", () => {
    describe("#when metadata.isSubagent is true", () => {
      it("#then skips injection entirely", async () => {
        //#given
        const search = createMockSearch({
          searchGoldenRules: async () => [goldenRuleResult("Always test")],
        })
        const hook = createMemoryInjectionHook({
          search,
          collector: mockCollector,
          getUsage: () => ({ usedTokens: 1000, remainingTokens: 9000, usagePercentage: 0.10 }),
        })

        const input = { metadata: { isSubagent: true } }
        const output: TransformOutput = { messages: [msg("user", "hello")] }

        //#when
        await hook["experimental.chat.messages.transform"](input, output)

        //#then
        expect(mockCollector.registered).toHaveLength(0)
      })
    })
  })

  describe("#given high context usage (>85%)", () => {
    describe("#when usagePercentage exceeds 0.85", () => {
      it("#then skips injection entirely", async () => {
        //#given
        const search = createMockSearch({
          searchGoldenRules: async () => [goldenRuleResult("Always test")],
        })
        const hook = createMemoryInjectionHook({
          search,
          collector: mockCollector,
          getUsage: () => ({ usedTokens: 17000, remainingTokens: 3000, usagePercentage: 0.87 }),
        })

        const input = {}
        const output: TransformOutput = { messages: [msg("user", "hello")] }

        //#when
        await hook["experimental.chat.messages.transform"](input, output)

        //#then
        expect(mockCollector.registered).toHaveLength(0)
      })
    })
  })

  describe("#given moderate context usage (>70%)", () => {
    describe("#when usagePercentage exceeds 0.70 but not 0.85", () => {
      it("#then injects golden rules only, capped at 200 tokens", async () => {
        //#given
        const search = createMockSearch({
          searchGoldenRules: async () => [
            goldenRuleResult("Always use parameterized queries"),
            goldenRuleResult("Never commit secrets"),
          ],
          searchAll: async () => [learningResult("Use bun test for running tests")],
        })
        const hook = createMemoryInjectionHook({
          search,
          collector: mockCollector,
          getUsage: () => ({ usedTokens: 14500, remainingTokens: 5500, usagePercentage: 0.73 }),
        })

        const input = {}
        const output: TransformOutput = { messages: [msg("user", "how do I query?")] }

        //#when
        await hook["experimental.chat.messages.transform"](input, output)

        //#then
        expect(mockCollector.registered).toHaveLength(1)
        const injected = mockCollector.registered[0]
        expect(injected.content).toContain("Golden Rules")
        expect(injected.content).toContain("Always use parameterized queries")
        expect(injected.content).not.toContain("Relevant Learnings")
        expect(injected.source).toBe("memory")
        expect(injected.priority).toBe("normal")
      })
    })
  })

  describe("#given low context usage (<70%)", () => {
    describe("#when golden rules and learnings are available", () => {
      it("#then injects both golden rules and relevant learnings", async () => {
        //#given
        const search = createMockSearch({
          searchGoldenRules: async () => [goldenRuleResult("Always use parameterized queries")],
          searchAll: async () => [
            learningResult("Use bun test for running tests"),
            learningResult("Mock modules before importing"),
          ],
        })
        const hook = createMemoryInjectionHook({
          search,
          collector: mockCollector,
          getUsage: () => ({ usedTokens: 5000, remainingTokens: 15000, usagePercentage: 0.25 }),
          recordLearningConsulted: consultTracker.record,
        })

        const input = {}
        const output: TransformOutput = { messages: [msg("user", "how do I test?")] }

        //#when
        await hook["experimental.chat.messages.transform"](input, output)

        //#then
        expect(mockCollector.registered).toHaveLength(1)
        const injected = mockCollector.registered[0]
        expect(injected.content).toContain("Golden Rules")
        expect(injected.content).toContain("Always use parameterized queries")
        expect(injected.content).toContain("Relevant Learnings")
        expect(injected.content).toContain("Use bun test for running tests")
        expect(consultTracker.consulted.map((learning) => learning.summary)).toEqual([
          "Use bun test for running tests",
          "Mock modules before importing",
        ])
      })
    })

    describe("#when no memories are found", () => {
      it("#then does not register any context", async () => {
        //#given
        const search = createMockSearch()
        const hook = createMemoryInjectionHook({
          search,
          collector: mockCollector,
          getUsage: () => ({ usedTokens: 5000, remainingTokens: 15000, usagePercentage: 0.25 }),
        })

        const input = {}
        const output: TransformOutput = { messages: [msg("user", "hello")] }

        //#when
        await hook["experimental.chat.messages.transform"](input, output)

        //#then
        expect(mockCollector.registered).toHaveLength(0)
      })
    })

    describe("#when no user messages exist", () => {
      it("#then still searches golden rules and injects if found", async () => {
        //#given
        const search = createMockSearch({
          searchGoldenRules: async () => [goldenRuleResult("Always test")],
        })
        const hook = createMemoryInjectionHook({
          search,
          collector: mockCollector,
          getUsage: () => ({ usedTokens: 5000, remainingTokens: 15000, usagePercentage: 0.25 }),
        })

        const input = {}
        const output: TransformOutput = { messages: [msg("assistant", "I can help")] }

        //#when
        await hook["experimental.chat.messages.transform"](input, output)

        //#then
        expect(mockCollector.registered).toHaveLength(1)
        expect(mockCollector.registered[0].content).toContain("Golden Rules")
      })
    })
  })

  describe("#given token budget enforcement", () => {
    describe("#when injection block exceeds maxTokens (500 default)", () => {
      it("#then trims learnings to fit within budget", async () => {
        //#given
        const longLearning = "A".repeat(2000)
        const search = createMockSearch({
          searchGoldenRules: async () => [goldenRuleResult("Short rule")],
          searchAll: async () => [
            learningResult(longLearning),
            learningResult("Short learning"),
          ],
        })
        const hook = createMemoryInjectionHook({
          search,
          collector: mockCollector,
          getUsage: () => ({ usedTokens: 5000, remainingTokens: 15000, usagePercentage: 0.25 }),
          config: { maxTokens: 500 },
        })

        const input = {}
        const output: TransformOutput = { messages: [msg("user", "test query")] }

        //#when
        await hook["experimental.chat.messages.transform"](input, output)

        //#then
        expect(mockCollector.registered).toHaveLength(1)
        const content = mockCollector.registered[0].content
        const estimatedTokens = Math.ceil(content.length / 4)
        expect(estimatedTokens).toBeLessThanOrEqual(500)
      })
    })

    describe("#when golden rules alone exceed goldenRuleMaxTokens (200) in throttled mode", () => {
      it("#then caps golden rules at 200 tokens", async () => {
        //#given
        const longRule = "B".repeat(800)
        const search = createMockSearch({
          searchGoldenRules: async () => [
            goldenRuleResult(longRule),
            goldenRuleResult("Another rule"),
          ],
        })
        const hook = createMemoryInjectionHook({
          search,
          collector: mockCollector,
          getUsage: () => ({ usedTokens: 14500, remainingTokens: 5500, usagePercentage: 0.73 }),
          config: { goldenRuleMaxTokens: 200 },
        })

        const input = {}
        const output: TransformOutput = { messages: [msg("user", "query")] }

        //#when
        await hook["experimental.chat.messages.transform"](input, output)

        //#then
        if (mockCollector.registered.length > 0) {
          const content = mockCollector.registered[0].content
          const estimatedTokens = Math.ceil(content.length / 4)
          expect(estimatedTokens).toBeLessThanOrEqual(200)
        }
      })
    })
  })

  describe("#given malformed memory dump entries", () => {
    describe("#when golden rules contain memory-dump markers", () => {
      it("#then filters malformed rules and keeps valid rules", async () => {
        //#given
        const malformedRule =
          "## Agent Memory\n### Golden Rules\n- Rule A\n### Relevant Learnings\n- Learning B\ntotalMemories: 4\nbyType: {'learnings':1,'golden_rules':3}"
        const search = createMockSearch({
          searchGoldenRules: async () => [
            goldenRuleResult(malformedRule),
            goldenRuleResult("Always run tests before claiming completion"),
          ],
          searchAll: async () => [],
        })
        const hook = createMemoryInjectionHook({
          search,
          collector: mockCollector,
          getUsage: () => ({ usedTokens: 5000, remainingTokens: 15000, usagePercentage: 0.25 }),
        })

        const input = {}
        const output: TransformOutput = { messages: [msg("user", "what should I do?")] }

        //#when
        await hook["experimental.chat.messages.transform"](input, output)

        //#then
        expect(mockCollector.registered).toHaveLength(1)
        const injected = mockCollector.registered[0].content
        expect(injected).toContain("Always run tests before claiming completion")
        expect(injected).not.toContain("totalMemories: 4")
      })
    })
  })

  describe("#given getUsage returns null", () => {
    describe("#when context window usage is unknown", () => {
      it("#then proceeds with full injection (default behavior)", async () => {
        //#given
        const search = createMockSearch({
          searchGoldenRules: async () => [goldenRuleResult("Always test")],
          searchAll: async () => [learningResult("Use mocks sparingly")],
        })
        const hook = createMemoryInjectionHook({
          search,
          collector: mockCollector,
          getUsage: () => null,
        })

        const input = {}
        const output: TransformOutput = { messages: [msg("user", "help")] }

        //#when
        await hook["experimental.chat.messages.transform"](input, output)

        //#then
        expect(mockCollector.registered).toHaveLength(1)
        expect(mockCollector.registered[0].content).toContain("Golden Rules")
        expect(mockCollector.registered[0].content).toContain("Relevant Learnings")
      })
    })
  })

  describe("#given search throws an error", () => {
    describe("#when searchAll or searchGoldenRules fails", () => {
      it("#then swallows the error silently (fire-and-forget)", async () => {
        //#given
        const search = createMockSearch({
          searchGoldenRules: async () => { throw new Error("DB connection lost") },
          searchAll: async () => { throw new Error("DB connection lost") },
        })
        const hook = createMemoryInjectionHook({
          search,
          collector: mockCollector,
          getUsage: () => ({ usedTokens: 5000, remainingTokens: 15000, usagePercentage: 0.25 }),
        })

        const input = {}
        const output: TransformOutput = { messages: [msg("user", "query")] }

        //#when — should not throw
        await hook["experimental.chat.messages.transform"](input, output)

        //#then
        expect(mockCollector.registered).toHaveLength(0)
      })
    })
  })

  describe("#given collector registration", () => {
    describe("#when injection succeeds", () => {
      it("#then registers with correct id, source, and priority", async () => {
        //#given
        const search = createMockSearch({
          searchGoldenRules: async () => [goldenRuleResult("Test rule")],
        })
        const hook = createMemoryInjectionHook({
          search,
          collector: mockCollector,
          getUsage: () => ({ usedTokens: 5000, remainingTokens: 15000, usagePercentage: 0.25 }),
        })

        const input = {}
        const output: TransformOutput = { messages: [msg("user", "hi", "ses-42")] }

        //#when
        await hook["experimental.chat.messages.transform"](input, output)

        //#then
        expect(mockCollector.registered).toHaveLength(1)
        const entry = mockCollector.registered[0]
        expect(entry.sessionID).toBe("ses-42")
        expect(entry.id).toBe("memory-injection")
        expect(entry.source).toBe("memory")
        expect(entry.priority).toBe("normal")
      })
    })
  })

  describe("#given last user message extraction", () => {
    describe("#when multiple user messages exist", () => {
      it("#then uses the last user message for search query", async () => {
        //#given
        let capturedQuery = ""
        const search = createMockSearch({
          searchGoldenRules: async () => [goldenRuleResult("Rule")],
          searchAll: async (query: string) => {
            capturedQuery = query
            return []
          },
        })
        const hook = createMemoryInjectionHook({
          search,
          collector: mockCollector,
          getUsage: () => ({ usedTokens: 5000, remainingTokens: 15000, usagePercentage: 0.25 }),
        })

        const input = {}
        const output: TransformOutput = {
          messages: [
            msg("user", "first question"),
            msg("assistant", "first answer"),
            msg("user", "second question about testing"),
          ],
        }

        //#when
        await hook["experimental.chat.messages.transform"](input, output)

        //#then
        expect(capturedQuery).toBe("second question about testing")
      })
    })
  })

  describe("#given sessionID resolution", () => {
    describe("#when messages have no sessionID and getMainSessionID is provided", () => {
      it("#then falls back to getMainSessionID", async () => {
        //#given
        const search = createMockSearch({
          searchGoldenRules: async () => [goldenRuleResult("Rule")],
        })
        const hook = createMemoryInjectionHook({
          search,
          collector: mockCollector,
          getUsage: () => ({ usedTokens: 5000, remainingTokens: 15000, usagePercentage: 0.25 }),
          getMainSessionID: () => "ses-main-fallback",
        })

        const noSessionMsg = {
          info: { role: "user" },
          parts: [{ type: "text", text: "hello" }],
        }
        const input = {}
        const output = { messages: [noSessionMsg] } as TransformOutput

        //#when
        await hook["experimental.chat.messages.transform"](input, output)

        //#then
        expect(mockCollector.registered).toHaveLength(1)
        expect(mockCollector.registered[0].sessionID).toBe("ses-main-fallback")
      })
    })

    describe("#when no sessionID is available at all", () => {
      it("#then skips injection", async () => {
        //#given
        const search = createMockSearch({
          searchGoldenRules: async () => [goldenRuleResult("Rule")],
        })
        const hook = createMemoryInjectionHook({
          search,
          collector: mockCollector,
          getUsage: () => ({ usedTokens: 5000, remainingTokens: 15000, usagePercentage: 0.25 }),
        })

        const noSessionMsg = {
          info: { role: "user" },
          parts: [{ type: "text", text: "hello" }],
        }
        const input = {}
        const output = { messages: [noSessionMsg] } as TransformOutput

        //#when
        await hook["experimental.chat.messages.transform"](input, output)

        //#then
        expect(mockCollector.registered).toHaveLength(0)
      })
    })
  })
})
