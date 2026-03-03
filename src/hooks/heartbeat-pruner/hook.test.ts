/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test"

import { createHeartbeatPrunerHook } from "./hook"

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string | ContentBlock[] }

interface Message {
  role: "user" | "assistant"
  content: ContentBlock[] | string
}

function toolUse(name: string, input: Record<string, unknown> = {}, id?: string): ContentBlock {
  return { type: "tool_use", id: id ?? `call_${name}_${Math.random().toString(36).slice(2, 8)}`, name, input }
}

function toolResult(toolUseId: string, content: string): ContentBlock {
  return { type: "tool_result", tool_use_id: toolUseId, content }
}

function text(t: string): ContentBlock {
  return { type: "text", text: t }
}

function assistant(...blocks: ContentBlock[]): Message {
  return { role: "assistant", content: blocks }
}

function user(...blocks: ContentBlock[]): Message {
  return { role: "user", content: blocks }
}

async function runHook(messages: Message[]): Promise<Message[]> {
  const hook = createHeartbeatPrunerHook()
  const handler = hook["experimental.chat.messages.transform"]
  const output = { messages: [...messages] }
  await handler({ messages: output.messages, sessionID: "test-session" }, output)
  return output.messages
}

describe("createHeartbeatPrunerHook", () => {
  describe("#given todowrite tool calls in older turns", () => {
    describe("#when there are more than 5 tool pairs after them", () => {
      it("#then prunes todowrite calls and replaces with summary", async () => {
        const todoId = "call_todo_1"
        const messages: Message[] = [
          assistant(toolUse("todowrite", { todos: [] }, todoId)),
          user(toolResult(todoId, "Todos updated")),
          // 6 more tool pairs to push todowrite beyond recent-5
          ...Array.from({ length: 6 }, (_, i) => {
            const id = `call_read_${i}`
            return [
              assistant(toolUse("read", { filePath: `/file${i}.ts` }, id)),
              user(toolResult(id, `content of file${i}`)),
            ]
          }).flat(),
        ]

        const result = await runHook(messages)

        const pruned = result.find(
          (m) => typeof m.content === "string" && m.content.includes("[Pruned:")
        )
        expect(pruned).toBeDefined()
        expect(pruned!.content).toContain("todowrite")
        expect(pruned!.content).toContain("no information lost")
      })
    })
  })

  describe("#given lsp_diagnostics calls with 0 errors", () => {
    describe("#when the result is clean (no errors found)", () => {
      it("#then prunes clean lsp_diagnostics results", async () => {
        const diagId = "call_diag_1"
        const messages: Message[] = [
          assistant(toolUse("lsp_diagnostics", { filePath: "/test.ts" }, diagId)),
          user(toolResult(diagId, "No errors found")),
          // 6 more pairs
          ...Array.from({ length: 6 }, (_, i) => {
            const id = `call_read_${i}`
            return [
              assistant(toolUse("read", { filePath: `/file${i}.ts` }, id)),
              user(toolResult(id, `content of file${i}`)),
            ]
          }).flat(),
        ]

        const result = await runHook(messages)

        const pruned = result.find(
          (m) => typeof m.content === "string" && m.content.includes("[Pruned:")
        )
        expect(pruned).toBeDefined()
        expect(pruned!.content).toContain("lsp_diagnostics")
      })
    })

    describe("#when the result contains errors", () => {
      it("#then preserves lsp_diagnostics with errors", async () => {
        const diagId = "call_diag_err"
        const messages: Message[] = [
          assistant(toolUse("lsp_diagnostics", { filePath: "/test.ts" }, diagId)),
          user(toolResult(diagId, "Error: TS2322 Type 'string' is not assignable")),
          ...Array.from({ length: 6 }, (_, i) => {
            const id = `call_read_${i}`
            return [
              assistant(toolUse("read", { filePath: `/file${i}.ts` }, id)),
              user(toolResult(id, `content of file${i}`)),
            ]
          }).flat(),
        ]

        const result = await runHook(messages)

        const hasDiagToolUse = result.some(
          (m) =>
            m.role === "assistant" &&
            Array.isArray(m.content) &&
            m.content.some((b) => b.type === "tool_use" && (b as { name: string }).name === "lsp_diagnostics")
        )
        expect(hasDiagToolUse).toBe(true)
      })
    })
  })

  describe("#given sequential duplicate tool calls", () => {
    describe("#when same tool + same input appears 3+ turns ago", () => {
      it("#then prunes duplicate calls", async () => {
        const id1 = "call_grep_1"
        const id2 = "call_grep_2"
        const sameInput = { pattern: "foo", path: "/src" }
        const messages: Message[] = [
          assistant(toolUse("grep", sameInput, id1)),
          user(toolResult(id1, "3 matches found")),
          assistant(toolUse("grep", sameInput, id2)),
          user(toolResult(id2, "3 matches found")),
          // 6 more pairs to push both beyond recent-5
          ...Array.from({ length: 6 }, (_, i) => {
            const id = `call_read_${i}`
            return [
              assistant(toolUse("read", { filePath: `/file${i}.ts` }, id)),
              user(toolResult(id, `content of file${i}`)),
            ]
          }).flat(),
        ]

        const result = await runHook(messages)

        const prunedSummary = result.find(
          (m) => typeof m.content === "string" && m.content.includes("[Pruned:")
        )
        expect(prunedSummary).toBeDefined()
      })
    })
  })

  describe("#given bash calls with only cd or ls", () => {
    describe("#when the bash command is just cd or ls", () => {
      it("#then prunes navigation-only bash calls", async () => {
        const cdId = "call_cd_1"
        const lsId = "call_ls_1"
        const messages: Message[] = [
          assistant(toolUse("bash", { command: "cd /src" }, cdId)),
          user(toolResult(cdId, "")),
          assistant(toolUse("bash", { command: "ls" }, lsId)),
          user(toolResult(lsId, "file1.ts\nfile2.ts")),
          // 6 more pairs
          ...Array.from({ length: 6 }, (_, i) => {
            const id = `call_read_${i}`
            return [
              assistant(toolUse("read", { filePath: `/file${i}.ts` }, id)),
              user(toolResult(id, `content of file${i}`)),
            ]
          }).flat(),
        ]

        const result = await runHook(messages)

        const prunedSummary = result.find(
          (m) => typeof m.content === "string" && m.content.includes("[Pruned:")
        )
        expect(prunedSummary).toBeDefined()
        expect(prunedSummary!.content).toContain("bash")
      })
    })
  })

  describe("#given the most recent 5 tool call/result pairs", () => {
    describe("#when they would normally be prunable", () => {
      it("#then always preserves the recent 5 pairs", async () => {
        const messages: Message[] = Array.from({ length: 5 }, (_, i) => {
          const id = `call_todo_${i}`
          return [
            assistant(toolUse("todowrite", { todos: [] }, id)),
            user(toolResult(id, "Todos updated")),
          ]
        }).flat()

        const result = await runHook(messages)

        // All 10 messages preserved (5 pairs)
        expect(result.length).toBe(10)
        const hasPruned = result.some(
          (m) => typeof m.content === "string" && m.content.includes("[Pruned:")
        )
        expect(hasPruned).toBe(false)
      })
    })
  })

  describe("#given error-producing tool calls", () => {
    describe("#when a tool result contains error information", () => {
      it("#then never prunes error results", async () => {
        const errId = "call_todo_err"
        const messages: Message[] = [
          assistant(toolUse("todowrite", { todos: [] }, errId)),
          user(toolResult(errId, "Error: Failed to update todos")),
          ...Array.from({ length: 6 }, (_, i) => {
            const id = `call_read_${i}`
            return [
              assistant(toolUse("read", { filePath: `/file${i}.ts` }, id)),
              user(toolResult(id, `content of file${i}`)),
            ]
          }).flat(),
        ]

        const result = await runHook(messages)

        const hasTodoToolUse = result.some(
          (m) =>
            m.role === "assistant" &&
            Array.isArray(m.content) &&
            m.content.some((b) => b.type === "tool_use" && (b as { name: string }).name === "todowrite")
        )
        expect(hasTodoToolUse).toBe(true)
      })
    })
  })

  describe("#given file-modifying tool calls", () => {
    describe("#when edit tool is used", () => {
      it("#then never prunes edit calls", async () => {
        const editId = "call_edit_1"
        const messages: Message[] = [
          assistant(toolUse("edit", { filePath: "/test.ts", edits: [] }, editId)),
          user(toolResult(editId, "File edited successfully")),
          ...Array.from({ length: 6 }, (_, i) => {
            const id = `call_read_${i}`
            return [
              assistant(toolUse("read", { filePath: `/file${i}.ts` }, id)),
              user(toolResult(id, `content of file${i}`)),
            ]
          }).flat(),
        ]

        const result = await runHook(messages)

        const hasEditToolUse = result.some(
          (m) =>
            m.role === "assistant" &&
            Array.isArray(m.content) &&
            m.content.some((b) => b.type === "tool_use" && (b as { name: string }).name === "edit")
        )
        expect(hasEditToolUse).toBe(true)
      })
    })

    describe("#when write tool is used", () => {
      it("#then never prunes write calls", async () => {
        const writeId = "call_write_1"
        const messages: Message[] = [
          assistant(toolUse("write", { filePath: "/test.ts", content: "hello" }, writeId)),
          user(toolResult(writeId, "File written successfully")),
          ...Array.from({ length: 6 }, (_, i) => {
            const id = `call_read_${i}`
            return [
              assistant(toolUse("read", { filePath: `/file${i}.ts` }, id)),
              user(toolResult(id, `content of file${i}`)),
            ]
          }).flat(),
        ]

        const result = await runHook(messages)

        const hasWriteToolUse = result.some(
          (m) =>
            m.role === "assistant" &&
            Array.isArray(m.content) &&
            m.content.some((b) => b.type === "tool_use" && (b as { name: string }).name === "write")
        )
        expect(hasWriteToolUse).toBe(true)
      })
    })

    describe("#when bash is used with side effects (not just cd/ls)", () => {
      it("#then never prunes side-effect bash calls", async () => {
        const bashId = "call_bash_build"
        const messages: Message[] = [
          assistant(toolUse("bash", { command: "npm run build" }, bashId)),
          user(toolResult(bashId, "Build succeeded")),
          ...Array.from({ length: 6 }, (_, i) => {
            const id = `call_read_${i}`
            return [
              assistant(toolUse("read", { filePath: `/file${i}.ts` }, id)),
              user(toolResult(id, `content of file${i}`)),
            ]
          }).flat(),
        ]

        const result = await runHook(messages)

        const hasBashToolUse = result.some(
          (m) =>
            m.role === "assistant" &&
            Array.isArray(m.content) &&
            m.content.some(
              (b) =>
                b.type === "tool_use" &&
                (b as { name: string }).name === "bash" &&
                JSON.stringify((b as { input: Record<string, unknown> }).input).includes("npm run build")
            )
        )
        expect(hasBashToolUse).toBe(true)
      })
    })
  })

  describe("#given consecutive prunable tool pairs", () => {
    describe("#when multiple prunable pairs are adjacent", () => {
      it("#then replaces them with a single compact summary", async () => {
        const todoId1 = "call_todo_c1"
        const todoId2 = "call_todo_c2"
        const diagId = "call_diag_c1"
        const messages: Message[] = [
          assistant(toolUse("todowrite", { todos: [] }, todoId1)),
          user(toolResult(todoId1, "Todos updated")),
          assistant(toolUse("todowrite", { todos: [] }, todoId2)),
          user(toolResult(todoId2, "Todos updated")),
          assistant(toolUse("lsp_diagnostics", { filePath: "/a.ts" }, diagId)),
          user(toolResult(diagId, "No errors found")),
          // 6 more pairs
          ...Array.from({ length: 6 }, (_, i) => {
            const id = `call_read_${i}`
            return [
              assistant(toolUse("read", { filePath: `/file${i}.ts` }, id)),
              user(toolResult(id, `content of file${i}`)),
            ]
          }).flat(),
        ]

        const result = await runHook(messages)

        const prunedMsg = result.find(
          (m) => typeof m.content === "string" && m.content.includes("[Pruned:")
        )
        expect(prunedMsg).toBeDefined()
        expect(prunedMsg!.content).toContain("3 tool calls")
        expect(prunedMsg!.content).toContain("todowrite x2")
        expect(prunedMsg!.content).toContain("lsp_diagnostics x1")
      })
    })
  })

  describe("#given text messages mixed with tool calls", () => {
    describe("#when assistant text messages are between tool calls", () => {
      it("#then preserves text messages and prunes only tool pairs", async () => {
        const todoId = "call_todo_t1"
        const messages: Message[] = [
          assistant(text("Let me check the todo list")),
          assistant(toolUse("todowrite", { todos: [] }, todoId)),
          user(toolResult(todoId, "Todos updated")),
          assistant(text("Now continuing with the work")),
          ...Array.from({ length: 6 }, (_, i) => {
            const id = `call_read_${i}`
            return [
              assistant(toolUse("read", { filePath: `/file${i}.ts` }, id)),
              user(toolResult(id, `content of file${i}`)),
            ]
          }).flat(),
        ]

        const result = await runHook(messages)

        const textMessages = result.filter(
          (m) =>
            m.role === "assistant" &&
            Array.isArray(m.content) &&
            m.content.some((b) => b.type === "text")
        )
        expect(textMessages.length).toBeGreaterThanOrEqual(2)
      })
    })
  })

  describe("#given no prunable tool calls", () => {
    describe("#when all tool calls are meaningful", () => {
      it("#then returns messages unchanged", async () => {
        const messages: Message[] = [
          assistant(text("Starting work")),
          ...Array.from({ length: 3 }, (_, i) => {
            const id = `call_read_${i}`
            return [
              assistant(toolUse("read", { filePath: `/file${i}.ts` }, id)),
              user(toolResult(id, `content of file${i}`)),
            ]
          }).flat(),
        ]

        const result = await runHook(messages)

        expect(result.length).toBe(messages.length)
      })
    })
  })

  describe("#given isZeroInfoCall receives a glob result with 0 matches", () => {
    it("#then it returns true (prunes zero-match glob)", async () => {
      const globId = "call_glob_empty"
      const messages: Message[] = [
        assistant(toolUse("glob", { pattern: "**/*.xyz" }, globId)),
        user(toolResult(globId, "No files found")),
        ...Array.from({ length: 6 }, (_, i) => {
          const id = `call_read_${i}`
          return [
            assistant(toolUse("read", { filePath: `/file${i}.ts` }, id)),
            user(toolResult(id, `content of file${i}`)),
          ]
        }).flat(),
      ]

      const result = await runHook(messages)

      const pruned = result.find(
        (m) => typeof m.content === "string" && m.content.includes("[Pruned:")
      )
      expect(pruned).toBeDefined()
      expect(pruned!.content).toContain("glob")
    })
  })

  describe("#given isZeroInfoCall receives a grep result with 0 matches", () => {
    it("#then it returns true (prunes zero-match grep)", async () => {
      const grepId = "call_grep_empty"
      const messages: Message[] = [
        assistant(toolUse("grep", { pattern: "nonExistentSymbol123" }, grepId)),
        user(toolResult(grepId, "No matches found")),
        ...Array.from({ length: 6 }, (_, i) => {
          const id = `call_read_${i}`
          return [
            assistant(toolUse("read", { filePath: `/file${i}.ts` }, id)),
            user(toolResult(id, `content of file${i}`)),
          ]
        }).flat(),
      ]

      const result = await runHook(messages)

      const pruned = result.find(
        (m) => typeof m.content === "string" && m.content.includes("[Pruned:")
      )
      expect(pruned).toBeDefined()
      expect(pruned!.content).toContain("grep")
    })
  })

  describe("#given isZeroInfoCall receives an mgrep result with 0 matches", () => {
    it("#then it returns true (prunes zero-match mgrep)", async () => {
      const mgrepId = "call_mgrep_empty"
      const messages: Message[] = [
        assistant(toolUse("mgrep", { q: "nonexistent pattern" }, mgrepId)),
        user(toolResult(mgrepId, "No results found")),
        ...Array.from({ length: 6 }, (_, i) => {
          const id = `call_read_${i}`
          return [
            assistant(toolUse("read", { filePath: `/file${i}.ts` }, id)),
            user(toolResult(id, `content of file${i}`)),
          ]
        }).flat(),
      ]

      const result = await runHook(messages)

      const pruned = result.find(
        (m) => typeof m.content === "string" && m.content.includes("[Pruned:")
      )
      expect(pruned).toBeDefined()
      expect(pruned!.content).toContain("mgrep")
    })
  })

  describe("#given isZeroInfoCall receives sequential read calls to the same file", () => {
    it("#then it identifies the duplicate (prunes redundant same-file reads)", async () => {
      const readId1 = "call_read_dup_1"
      const readId2 = "call_read_dup_2"
      const messages: Message[] = [
        assistant(toolUse("read", { filePath: "/src/same-file.ts", offset: 1 }, readId1)),
        user(toolResult(readId1, "file content here (first read)")),
        assistant(toolUse("read", { filePath: "/src/same-file.ts", offset: 50 }, readId2)),
        user(toolResult(readId2, "file content here (second read, different offset)")),
        ...Array.from({ length: 6 }, (_, i) => {
          const id = `call_read_other_${i}`
          return [
            assistant(toolUse("read", { filePath: `/other-file${i}.ts` }, id)),
            user(toolResult(id, `content of other-file${i}`)),
          ]
        }).flat(),
      ]

      const result = await runHook(messages)

      const pruned = result.find(
        (m) => typeof m.content === "string" && m.content.includes("[Pruned:")
      )
      expect(pruned).toBeDefined()
      expect(pruned!.content).toContain("read")
    })
  })

  describe("#given isZeroInfoCall receives a glob result with matches", () => {
    it("#then it returns false (does not prune glob with results)", async () => {
      const globId = "call_glob_with_results"
      const messages: Message[] = [
        assistant(toolUse("glob", { pattern: "**/*.ts" }, globId)),
        user(toolResult(globId, "src/index.ts\nsrc/hook.ts\nsrc/main.ts")),
        ...Array.from({ length: 6 }, (_, i) => {
          const id = `call_read_${i}`
          return [
            assistant(toolUse("read", { filePath: `/file${i}.ts` }, id)),
            user(toolResult(id, `content of file${i}`)),
          ]
        }).flat(),
      ]

      const result = await runHook(messages)

      const hasGlobToolUse = result.some(
        (m) =>
          m.role === "assistant" &&
          Array.isArray(m.content) &&
          m.content.some((b) => b.type === "tool_use" && (b as { name: string }).name === "glob")
      )
      expect(hasGlobToolUse).toBe(true)
    })
  })

  describe("#given shouldNeverPrune is called", () => {
    it("#then it still protects file-modifying tools (regression)", async () => {
      const editId = "call_edit_regression"
      const writeId = "call_write_regression"
      const bashId = "call_bash_regression"
      const messages: Message[] = [
        assistant(toolUse("edit", { filePath: "/a.ts", edits: [] }, editId)),
        user(toolResult(editId, "File edited")),
        assistant(toolUse("write", { filePath: "/b.ts", content: "x" }, writeId)),
        user(toolResult(writeId, "File written")),
        assistant(toolUse("bash", { command: "bun run build" }, bashId)),
        user(toolResult(bashId, "Build succeeded")),
        ...Array.from({ length: 6 }, (_, i) => {
          const id = `call_read_${i}`
          return [
            assistant(toolUse("read", { filePath: `/file${i}.ts` }, id)),
            user(toolResult(id, `content of file${i}`)),
          ]
        }).flat(),
      ]

      const result = await runHook(messages)

      const toolNames = ["edit", "write", "bash"]
      for (const name of toolNames) {
        const preserved = result.some(
          (m) =>
            m.role === "assistant" &&
            Array.isArray(m.content) &&
            m.content.some((b) => b.type === "tool_use" && (b as { name: string }).name === name)
        )
        expect(preserved).toBe(true)
      }
    })
  })
})
