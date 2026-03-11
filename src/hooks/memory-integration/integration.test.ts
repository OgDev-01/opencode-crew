import { beforeEach, describe, expect, test } from "bun:test"
import {
  createMemoryDecisionDetectionHook,
  createMemoryLearningHook,
  createMemoryPreCompactionFlushHook,
} from "../../hooks"
import type { AutoCaptureConfig } from "../../config/schema/memory"
import { subagentSessions } from "../../features/claude-code-session-state"
import type { GoldenRule, IMemoryStorage, Learning, MemoryScope } from "../../features/memory/types"

type HookName = "memory-learning" | "memory-decision-detection" | "memory-pre-compaction-flush"

function createAutoCaptureConfig(overrides?: Partial<AutoCaptureConfig>): AutoCaptureConfig {
  return {
    enabled: true,
    on_success: true,
    on_failure: true,
    decision_detection: true,
    pre_compaction_flush: true,
    capture_tools: [],
    skip_tools: ["Read", "Glob", "Grep"],
    patterns: [],
    ...overrides,
  }
}

function createMockStorage(): IMemoryStorage & { learnings: Learning[]; goldenRules: GoldenRule[] } {
  const learnings: Learning[] = []
  const goldenRules: GoldenRule[] = []

  return {
    learnings,
    goldenRules,
    async addLearning(learning: Learning) {
      learnings.push(learning)
    },
    async getLearning(id: string) {
      return learnings.find((learning) => learning.id === id) ?? null
    },
    async getLearningsByScope(_scope: MemoryScope) {
      return learnings
    },
    async updateLearning(id: string, updates: Partial<Learning>) {
      const index = learnings.findIndex((learning) => learning.id === id)
      if (index < 0) return
      learnings[index] = { ...learnings[index], ...updates }
    },
    async deleteLearning(id: string) {
      const index = learnings.findIndex((learning) => learning.id === id)
      if (index >= 0) {
        learnings.splice(index, 1)
      }
    },
    async addGoldenRule(rule: GoldenRule) {
      goldenRules.push(rule)
    },
    async getGoldenRules() {
      return goldenRules
    },
    async getGoldenRulesByScope(_scope: MemoryScope) {
      return goldenRules
    },
    async deleteGoldenRule(id: string) {
      const index = goldenRules.findIndex((rule) => rule.id === id)
      if (index >= 0) {
        goldenRules.splice(index, 1)
      }
    },
    async getStats() {
      return { learnings: learnings.length, goldenRules: goldenRules.length }
    },
  }
}

function createLifecycleSpies() {
  const calls = {
    onSessionStart: 0,
    onSessionEnd: 0,
    onIdle: 0,
    sessionIds: [] as string[],
  }

  return {
    calls,
    onSessionStart: async (sessionID: string) => {
      calls.onSessionStart++
      calls.sessionIds.push(sessionID)
    },
    onSessionEnd: async (sessionID: string) => {
      calls.onSessionEnd++
      calls.sessionIds.push(sessionID)
    },
    onIdle: async () => {
      calls.onIdle++
    },
  }
}

function createAutoCaptureSystem(args: {
  storage: IMemoryStorage
  autoCapture: AutoCaptureConfig
  scope?: MemoryScope
  privacyTags?: string[]
  disabledHooks?: HookName[]
  onIdle: () => Promise<void>
}) {
  const disabledHooks = new Set(args.disabledHooks ?? [])

  const learningHook = disabledHooks.has("memory-learning")
    ? null
    : createMemoryLearningHook({
        storage: args.storage,
        autoCapture: args.autoCapture,
        privacyTags: args.privacyTags,
        scope: args.scope,
      })

  const decisionHook = disabledHooks.has("memory-decision-detection")
    ? null
    : createMemoryDecisionDetectionHook({
        storage: args.storage,
        autoCapture: args.autoCapture,
        privacyTags: args.privacyTags,
      })

  const flushHook = disabledHooks.has("memory-pre-compaction-flush")
    ? null
    : createMemoryPreCompactionFlushHook({
        onIdle: args.onIdle,
        autoCapture: args.autoCapture,
      })

  return {
    async runToolCompletion(input: { tool: string; sessionID: string; callID: string }, output: { title: string; output: string; metadata: Record<string, unknown> } | undefined) {
      if (!learningHook) return
      await learningHook["tool.execute.after"](input, output)
    },
    async runChatMessage(sessionID: string, text: string, role: "user" | "assistant" = "user") {
      if (!decisionHook) return
      await decisionHook["chat.message"](
        { sessionID },
        {
          message: { role },
          parts: [{ type: "text", text }],
        }
      )
    },
    async runPreCompactionFlush() {
      if (!flushHook) return
      await flushHook.flush()
    },
  }
}

describe("memory auto-capture integration", () => {
  let storage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    storage = createMockStorage()
    subagentSessions.clear()
  })

  describe("#given all hooks are active with shared storage", () => {
    describe("#when a tool completion and decision message occur in the same session", () => {
      test("captures a learning and a golden rule across hooks", async () => {
        //#given
        const lifecycle = createLifecycleSpies()
        const system = createAutoCaptureSystem({
          storage,
          autoCapture: createAutoCaptureConfig(),
          onIdle: lifecycle.onIdle,
        })

        //#when
        await system.runToolCompletion(
          { tool: "Bash", sessionID: "ses_1", callID: "call_1" },
          {
            title: "tool complete",
            output: "Error: failed to locate binary",
            metadata: { exitCode: 1 },
          }
        )
        await system.runChatMessage("ses_1", "let's use Bun")
        await system.runPreCompactionFlush()

        //#then
        expect(storage.learnings).toHaveLength(1)
        expect(storage.goldenRules).toHaveLength(1)
        expect(storage.learnings[0].domain).toBe("project")
        expect(storage.goldenRules[0].rule).toBe("Preference: Let's use Bun")
      })
    })
  })

  describe("#given lifecycle delegates", () => {
    describe("#when lifecycle methods and pre-compaction flush execute", () => {
      test("verifies onSessionStart onSessionEnd and onIdle call counts", async () => {
        //#given
        const lifecycle = createLifecycleSpies()
        const system = createAutoCaptureSystem({
          storage,
          autoCapture: createAutoCaptureConfig(),
          onIdle: lifecycle.onIdle,
        })

        //#when
        await lifecycle.onSessionStart("ses_lifecycle")
        await system.runPreCompactionFlush()
        await lifecycle.onSessionEnd("ses_lifecycle")

        //#then
        expect(lifecycle.calls.onSessionStart).toBe(1)
        expect(lifecycle.calls.onIdle).toBe(1)
        expect(lifecycle.calls.onSessionEnd).toBe(1)
        expect(lifecycle.calls.sessionIds).toEqual(["ses_lifecycle", "ses_lifecycle"])
      })
    })
  })

  describe("#given auto_capture.enabled is false and feature flags are disabled", () => {
    describe("#when success capture decision detection and pre-compaction flush are triggered", () => {
      test("disables all new auto-capture behaviors", async () => {
        //#given
        const lifecycle = createLifecycleSpies()
        const system = createAutoCaptureSystem({
          storage,
          autoCapture: createAutoCaptureConfig({
            enabled: false,
            decision_detection: false,
            pre_compaction_flush: false,
            on_success: true,
          }),
          onIdle: lifecycle.onIdle,
        })

        //#when
        await system.runToolCompletion(
          { tool: "Bash", sessionID: "ses_disabled", callID: "call_disabled" },
          {
            title: "success",
            output: "Build completed successfully with deterministic chunks and no warnings in CI.",
            metadata: { exitCode: 0 },
          }
        )
        await system.runChatMessage("ses_disabled", "let's use Bun")
        await system.runPreCompactionFlush()

        //#then
        expect(storage.learnings).toHaveLength(0)
        expect(storage.goldenRules).toHaveLength(0)
        expect(lifecycle.calls.onIdle).toBe(0)
      })
    })
  })

  describe("#given an individual hook is disabled via disabled_hooks", () => {
    describe("#when memory-learning is disabled", () => {
      test("does not capture tool output while decision detection still works", async () => {
        //#given
        const lifecycle = createLifecycleSpies()
        const system = createAutoCaptureSystem({
          storage,
          autoCapture: createAutoCaptureConfig(),
          disabledHooks: ["memory-learning"],
          onIdle: lifecycle.onIdle,
        })

        //#when
        await system.runToolCompletion(
          { tool: "Bash", sessionID: "ses_hook_disable", callID: "call_hook_disable" },
          {
            title: "failed",
            output: "Error: cannot connect to host",
            metadata: { exitCode: 1 },
          }
        )
        await system.runChatMessage("ses_hook_disable", "let's use Bun")

        //#then
        expect(storage.learnings).toHaveLength(0)
        expect(storage.goldenRules).toHaveLength(1)
      })
    })
  })

  describe("#given skip_tools overrides include Bash", () => {
    describe("#when on_success is true and Bash output is successful", () => {
      test("skips Bash capture", async () => {
        //#given
        const lifecycle = createLifecycleSpies()
        const system = createAutoCaptureSystem({
          storage,
          autoCapture: createAutoCaptureConfig({
            enabled: true,
            on_success: true,
            skip_tools: ["Bash"],
          }),
          onIdle: lifecycle.onIdle,
        })

        //#when
        await system.runToolCompletion(
          { tool: "Bash", sessionID: "ses_skip", callID: "call_skip" },
          {
            title: "success",
            output: "Build completed successfully with deterministic chunks and release manifests generated.",
            metadata: { exitCode: 0 },
          }
        )

        //#then
        expect(storage.learnings).toHaveLength(0)
      })
    })
  })

  describe("#given a subagent session", () => {
    describe("#when both hooks receive events", () => {
      test("excludes decision capture and preserves zero total captures", async () => {
        //#given
        subagentSessions.add("ses_sub")
        const lifecycle = createLifecycleSpies()
        const system = createAutoCaptureSystem({
          storage,
          autoCapture: createAutoCaptureConfig(),
          onIdle: lifecycle.onIdle,
        })

        //#when
        await system.runToolCompletion(
          { tool: "Read", sessionID: "ses_sub", callID: "call_sub" },
          {
            title: "read",
            output: "file content",
            metadata: {},
          }
        )
        await system.runChatMessage("ses_sub", "let's use Bun")

        //#then
        expect(storage.learnings).toHaveLength(0)
        expect(storage.goldenRules).toHaveLength(0)
      })
    })
  })

  describe("#given empty and null-like tool output", () => {
    describe("#when tool completion receives undefined output", () => {
      test("does not create a learning", async () => {
        //#given
        const lifecycle = createLifecycleSpies()
        const system = createAutoCaptureSystem({
          storage,
          autoCapture: createAutoCaptureConfig(),
          onIdle: lifecycle.onIdle,
        })

        //#when
        await system.runToolCompletion(
          { tool: "Bash", sessionID: "ses_empty", callID: "call_empty" },
          undefined
        )

        //#then
        expect(storage.learnings).toHaveLength(0)
      })
    })
  })

  describe("#given privacy tags include secret", () => {
    describe("#when learning and decision flows process sensitive content", () => {
      test("redacts sensitive content in both learning context and golden rule", async () => {
        //#given
        const lifecycle = createLifecycleSpies()
        const system = createAutoCaptureSystem({
          storage,
          autoCapture: createAutoCaptureConfig(),
          privacyTags: ["secret"],
          onIdle: lifecycle.onIdle,
        })

        //#when
        await system.runToolCompletion(
          { tool: "Bash", sessionID: "ses_privacy", callID: "call_privacy" },
          {
            title: "failed",
            output: "Error: auth failed <secret>api-key-123</secret>",
            metadata: { exitCode: 1 },
          }
        )
        await system.runChatMessage("ses_privacy", "let's use <secret>token-xyz</secret>")

        //#then
        expect(storage.learnings).toHaveLength(1)
        expect(storage.learnings[0].context).toContain("[REDACTED]")
        expect(storage.learnings[0].context).not.toContain("api-key-123")
        expect(storage.goldenRules).toHaveLength(1)
        expect(storage.goldenRules[0].rule).toContain("[REDACTED]")
        expect(storage.goldenRules[0].rule).not.toContain("token-xyz")
      })
    })
  })

  describe("#given storage and flush delegates throw errors", () => {
    describe("#when all hooks run", () => {
      test("does not propagate errors from any auto-capture path", async () => {
        //#given
        const throwingStorage = createMockStorage()
        throwingStorage.addLearning = async () => {
          throw new Error("learning store unavailable")
        }
        throwingStorage.addGoldenRule = async () => {
          throw new Error("golden rule store unavailable")
        }

        const throwingOnIdle = async () => {
          throw new Error("flush unavailable")
        }

        const system = createAutoCaptureSystem({
          storage: throwingStorage,
          autoCapture: createAutoCaptureConfig(),
          onIdle: throwingOnIdle,
        })

        //#when + #then
        await expect(
          system.runToolCompletion(
            { tool: "Bash", sessionID: "ses_errors", callID: "call_errors_1" },
            {
              title: "failed",
              output: "Error: host unreachable",
              metadata: { exitCode: 1 },
            }
          )
        ).resolves.toBeUndefined()

        await expect(system.runChatMessage("ses_errors", "let's use Bun")).resolves.toBeUndefined()
        await expect(system.runPreCompactionFlush()).resolves.toBeUndefined()
      })
    })
  })
})
