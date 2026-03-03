import { beforeEach, describe, expect, test } from "bun:test"
import type { IMemoryStorage, Learning } from "../../features/memory/types"
import { createMemoryLearningHook } from "./hook"

function createMockStorage(): IMemoryStorage & { learnings: Learning[] } {
  const learnings: Learning[] = []
  return {
    learnings,
    async addLearning(learning: Learning) {
      learnings.push(learning)
    },
    async getLearning(id: string) {
      return learnings.find((l) => l.id === id) ?? null
    },
    async updateLearning(id: string, updates: Partial<Learning>) {
      const idx = learnings.findIndex((l) => l.id === id)
      if (idx >= 0) {
        learnings[idx] = { ...learnings[idx], ...updates }
      }
    },
    async deleteLearning(id: string) {
      const idx = learnings.findIndex((l) => l.id === id)
      if (idx >= 0) learnings.splice(idx, 1)
    },
    async addGoldenRule() {},
    async getGoldenRules() {
      return []
    },
    async getStats() {
      return { learnings: learnings.length, goldenRules: 0 }
    },
  }
}

describe("memory-learning hook", () => {
  let storage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    storage = createMockStorage()
  })

  describe("#given a Bash tool failure with error keyword", () => {
    test("captures learning with type 'failure'", async () => {
      //#given
      const hook = createMemoryLearningHook({ storage })
      const input = { tool: "Bash", sessionID: "ses_1", callID: "call_1" }
      const output = {
        title: "command failed",
        output: "Error: module not found\nCould not resolve 'foo'",
        metadata: {} as Record<string, unknown>,
      }

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(storage.learnings).toHaveLength(1)
      expect(storage.learnings[0].type).toBe("failure")
      expect(storage.learnings[0].tool_name).toBe("Bash")
      expect(storage.learnings[0].summary).toContain("Bash")
    })
  })

  describe("#given a Bash tool with non-zero exitCode in metadata", () => {
    test("captures learning even without error keyword in output", async () => {
      //#given
      const hook = createMemoryLearningHook({ storage })
      const input = { tool: "Bash", sessionID: "ses_2", callID: "call_2" }
      const output = {
        title: "done",
        output: "some output without error keywords",
        metadata: { exitCode: 1 } as Record<string, unknown>,
      }

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(storage.learnings).toHaveLength(1)
      expect(storage.learnings[0].type).toBe("failure")
    })
  })

  describe("#given a Bash tool with successful output (no errors)", () => {
    test("does NOT capture learning", async () => {
      //#given
      const hook = createMemoryLearningHook({ storage })
      const input = { tool: "Bash", sessionID: "ses_3", callID: "call_3" }
      const output = {
        title: "ok",
        output: "Build completed successfully in 2.3s",
        metadata: { exitCode: 0 } as Record<string, unknown>,
      }

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(storage.learnings).toHaveLength(0)
    })
  })

  describe("#given an Edit tool with attempt > 1", () => {
    test("captures learning as observation", async () => {
      //#given
      const hook = createMemoryLearningHook({ storage })
      const input = { tool: "Edit", sessionID: "ses_4", callID: "call_4" }
      const output = {
        title: "edited file",
        output: "File updated: src/foo.ts",
        metadata: { attempt: 2 } as Record<string, unknown>,
      }

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(storage.learnings).toHaveLength(1)
      expect(storage.learnings[0].tool_name).toBe("Edit")
    })
  })

  describe("#given an Edit tool with attempt = 1 (first try)", () => {
    test("does NOT capture learning", async () => {
      //#given
      const hook = createMemoryLearningHook({ storage })
      const input = { tool: "Edit", sessionID: "ses_5", callID: "call_5" }
      const output = {
        title: "edited",
        output: "Success",
        metadata: { attempt: 1 } as Record<string, unknown>,
      }

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(storage.learnings).toHaveLength(0)
    })
  })

  describe("#given a Write tool with attempt > 1", () => {
    test("captures learning", async () => {
      //#given
      const hook = createMemoryLearningHook({ storage })
      const input = { tool: "Write", sessionID: "ses_6", callID: "call_6" }
      const output = {
        title: "written",
        output: "File written: src/bar.ts",
        metadata: { attempt: 3 } as Record<string, unknown>,
      }

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(storage.learnings).toHaveLength(1)
      expect(storage.learnings[0].tool_name).toBe("Write")
    })
  })

  describe("#given a Read tool output", () => {
    test("does NOT capture learning (noise filter)", async () => {
      //#given
      const hook = createMemoryLearningHook({ storage })
      const input = { tool: "Read", sessionID: "ses_7", callID: "call_7" }
      const output = {
        title: "read file",
        output: "file contents here",
        metadata: {} as Record<string, unknown>,
      }

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(storage.learnings).toHaveLength(0)
    })
  })

  describe("#given a Glob tool output", () => {
    test("does NOT capture learning", async () => {
      //#given
      const hook = createMemoryLearningHook({ storage })
      const input = { tool: "Glob", sessionID: "ses_8", callID: "call_8" }
      const output = {
        title: "glob results",
        output: "file1.ts\nfile2.ts",
        metadata: {} as Record<string, unknown>,
      }

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(storage.learnings).toHaveLength(0)
    })
  })

  describe("#given a Grep tool output", () => {
    test("does NOT capture learning", async () => {
      //#given
      const hook = createMemoryLearningHook({ storage })
      const input = { tool: "Grep", sessionID: "ses_9", callID: "call_9" }
      const output = {
        title: "grep results",
        output: "matched line 1",
        metadata: {} as Record<string, unknown>,
      }

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(storage.learnings).toHaveLength(0)
    })
  })

  describe("#given metadata.memory_capture = true", () => {
    test("captures learning regardless of tool type", async () => {
      //#given
      const hook = createMemoryLearningHook({ storage })
      const input = { tool: "SomeCustomTool", sessionID: "ses_10", callID: "call_10" }
      const output = {
        title: "custom result",
        output: "Important finding here",
        metadata: { memory_capture: true } as Record<string, unknown>,
      }

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(storage.learnings).toHaveLength(1)
    })
  })

  describe("#given undefined output", () => {
    test("does NOT capture learning", async () => {
      //#given
      const hook = createMemoryLearningHook({ storage })
      const input = { tool: "Bash", sessionID: "ses_11", callID: "call_11" }

      //#when
      await hook["tool.execute.after"](input, undefined)

      //#then
      expect(storage.learnings).toHaveLength(0)
    })
  })

  describe("#given storage throws an error", () => {
    test("does NOT propagate error (fire-and-forget)", async () => {
      //#given
      const throwingStorage = createMockStorage()
      throwingStorage.addLearning = async () => {
        throw new Error("DB connection lost")
      }
      const hook = createMemoryLearningHook({ storage: throwingStorage })
      const input = { tool: "Bash", sessionID: "ses_12", callID: "call_12" }
      const output = {
        title: "failed",
        output: "Error: something broke",
        metadata: {} as Record<string, unknown>,
      }

      //#when + #then — should not throw
      await expect(hook["tool.execute.after"](input, output)).resolves.toBeUndefined()
    })
  })

  describe("#given privacy tags in content", () => {
    test("filters content before storing", async () => {
      //#given
      const hook = createMemoryLearningHook({ storage, privacyTags: ["secret"] })
      const input = { tool: "Bash", sessionID: "ses_13", callID: "call_13" }
      const output = {
        title: "command failed",
        output: "Error: auth failed <secret>my-api-key-123</secret> details",
        metadata: {} as Record<string, unknown>,
      }

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(storage.learnings).toHaveLength(1)
      expect(storage.learnings[0].context).not.toContain("my-api-key-123")
      expect(storage.learnings[0].context).toContain("[REDACTED]")
    })
  })

  describe("#given a learning is captured", () => {
    test("sets initial utility_score=0.5 and confidence=0.5", async () => {
      //#given
      const hook = createMemoryLearningHook({ storage })
      const input = { tool: "Bash", sessionID: "ses_14", callID: "call_14" }
      const output = {
        title: "failed",
        output: "Error: not found",
        metadata: {} as Record<string, unknown>,
      }

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(storage.learnings[0].utility_score).toBe(0.5)
      expect(storage.learnings[0].confidence).toBe(0.5)
    })

    test("generates a context_hash", async () => {
      //#given
      const hook = createMemoryLearningHook({ storage })
      const input = { tool: "Bash", sessionID: "ses_15", callID: "call_15" }
      const output = {
        title: "failed",
        output: "Error: permission denied on /etc/shadow",
        metadata: {} as Record<string, unknown>,
      }

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(storage.learnings[0].context_hash).toBeString()
      expect(storage.learnings[0].context_hash.length).toBe(64)
    })

    test("generates summary from tool name and first line of output", async () => {
      //#given
      const hook = createMemoryLearningHook({ storage })
      const input = { tool: "Bash", sessionID: "ses_16", callID: "call_16" }
      const output = {
        title: "cmd",
        output: "Error: ENOENT no such file\nsome more details",
        metadata: {} as Record<string, unknown>,
      }

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(storage.learnings[0].summary).toBe("Bash: Error: ENOENT no such file")
    })
  })

  describe("#given duplicate context_hash within same session", () => {
    test("does NOT capture duplicate learning", async () => {
      //#given
      const hook = createMemoryLearningHook({ storage })
      const input = { tool: "Bash", sessionID: "ses_17", callID: "call_17a" }
      const output = {
        title: "fail",
        output: "Error: same error repeated",
        metadata: {} as Record<string, unknown>,
      }

      //#when
      await hook["tool.execute.after"](input, output)
      await hook["tool.execute.after"](
        { ...input, callID: "call_17b" },
        output,
      )

      //#then
      expect(storage.learnings).toHaveLength(1)
    })
  })

  describe("#given Bash output with 'permission denied'", () => {
    test("captures as failure", async () => {
      //#given
      const hook = createMemoryLearningHook({ storage })
      const input = { tool: "Bash", sessionID: "ses_18", callID: "call_18" }
      const output = {
        title: "denied",
        output: "bash: /usr/local/bin/foo: Permission denied",
        metadata: {} as Record<string, unknown>,
      }

      //#when
      await hook["tool.execute.after"](input, output)

      //#then
      expect(storage.learnings).toHaveLength(1)
      expect(storage.learnings[0].type).toBe("failure")
    })
  })
})
