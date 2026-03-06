import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { closeAll, initializeDatabase } from "../../features/memory/db/client"
import { createMemoryStorage } from "../../features/memory/storage/memory-storage"
import { createSearchService } from "../../features/memory/search/search-service"
import { createElfTool } from "./tool"
import type { IMemoryStorage } from "../../features/memory/types"

function makeDeps(db: Database) {
  const storage = createMemoryStorage(db)
  const search = createSearchService(db)
  return {
    storage,
    search,
    db,
    filterContent: (content: string, _tags: string[]) => content,
    computeContextHash: (type: string, scope: string, content: string) => `hash-${type}-${scope}-${content.slice(0, 10)}`,
    findExistingByHash: (_hash: string, _db: Database) => null as string | null,
  }
}

describe("#given ELF tool", () => {
  let db: Database
  let storage: IMemoryStorage

  beforeEach(() => {
    closeAll()
    db = initializeDatabase(":memory:")
    storage = createMemoryStorage(db)
  })

  afterEach(() => {
    closeAll()
  })

  describe("#when action is search", () => {
    describe("#then it returns ranked results from memory", () => {
      it("returns search results for a query", async () => {
        await storage.addLearning({
          id: "ignore",
          type: "success",
          summary: "React hooks best practices",
          context: "frontend patterns",
          tool_name: "Read",
          domain: "frontend",
          tags: ["react", "hooks"],
          utility_score: 0.8,
          times_consulted: 0,
          context_hash: "hash-search-1",
          confidence: 0.9,
          created_at: "",
          updated_at: "",
        })

        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          { action: "search", query: "react hooks" },
          {} as Parameters<typeof tool.execute>[1]
        )

        expect(typeof result).toBe("string")
        const parsed = JSON.parse(result as string)
        expect(parsed.results).toBeArray()
        expect(parsed.results.length).toBeGreaterThan(0)
        expect(parsed.results[0].score).toBeNumber()
      })

      it("returns empty results for unmatched query", async () => {
        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          { action: "search", query: "nonexistent topic xyz" },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.results).toBeArray()
        expect(parsed.results.length).toBe(0)
      })

      it("respects limit parameter", async () => {
        for (let i = 0; i < 5; i++) {
          await storage.addLearning({
            id: `ignore-${i}`,
            type: "success",
            summary: `TypeScript pattern number ${i}`,
            context: "backend",
            tool_name: "Read",
            domain: "backend",
            tags: ["typescript"],
            utility_score: 0.5,
            times_consulted: 0,
            context_hash: `hash-limit-${i}`,
            confidence: 0.7,
            created_at: "",
            updated_at: "",
          })
        }

        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          { action: "search", query: "typescript pattern", limit: 2 },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.results.length).toBeLessThanOrEqual(2)
      })
    })
  })

  describe("#when action is add-rule", () => {
    describe("#then it stores a new memory with privacy filtering", () => {
      it("adds a learning and returns confirmation with ID", async () => {
        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          {
            action: "add-rule",
            content: "Always use dependency injection for testability",
            type: "learning",
            scope: "project",
          },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.id).toBeString()
        expect(parsed.status).toBe("added")
        expect(parsed.deduplicated).toBe(false)
      })

      it("adds a golden_rule type", async () => {
        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          {
            action: "add-rule",
            content: "Never use as any in production code",
            type: "golden_rule",
            scope: "global",
          },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.id).toBeString()
        expect(parsed.status).toBe("added")
      })

      it("applies privacy filter before storing", async () => {
        let filteredContent = ""
        const deps = {
          ...makeDeps(db),
          filterContent: (content: string, _tags: string[]) => {
            filteredContent = content.replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED]")
            return filteredContent
          },
        }
        const tool = createElfTool(deps)
        await tool.execute(
          {
            action: "add-rule",
            content: "Found key AKIAIOSFODNN7EXAMPLE in config",
            type: "learning",
          },
          {} as Parameters<typeof tool.execute>[1]
        )

        expect(filteredContent).toContain("[REDACTED]")
        expect(filteredContent).not.toContain("AKIAIOSFODNN7EXAMPLE")
      })

      it("detects duplicate via context hash", async () => {
        const deps = {
          ...makeDeps(db),
          findExistingByHash: (_hash: string, _db: Database) => "existing-id-123",
        }
        const tool = createElfTool(deps)
        const result = await tool.execute(
          {
            action: "add-rule",
            content: "Some duplicate content",
            type: "learning",
          },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.deduplicated).toBe(true)
        expect(parsed.existingId).toBe("existing-id-123")
      })

      it("rejects memory-dump shaped content", async () => {
        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          {
            action: "add-rule",
            type: "golden_rule",
            content:
              "## Agent Memory\n### Golden Rules\n- Rule A\n### Learnings\n- Item B\ntotalMemories: 4\nbyType: {'learnings':1,'golden_rules':3}",
          },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.status).toBe("rejected")
        expect(parsed.error).toContain("memory dump")
      })
    })
  })

  describe("#when action is metrics", () => {
    describe("#then it returns memory system statistics", () => {
      it("returns stats with totalMemories and byType breakdown", async () => {
        await storage.addLearning({
          id: "ignore",
          type: "success",
          summary: "test learning",
          context: "test",
          tool_name: "Bash",
          domain: "testing",
          tags: [],
          utility_score: 0.5,
          times_consulted: 0,
          context_hash: "hash-metrics-1",
          confidence: 0.7,
          created_at: "",
          updated_at: "",
        })

        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          { action: "metrics" },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.totalMemories).toBeNumber()
        expect(parsed.totalMemories).toBeGreaterThanOrEqual(1)
        expect(parsed.byType.learnings).toBeNumber()
        expect(parsed.byType.golden_rules).toBeNumber()
      })
    })
  })

  describe("#when action is unknown", () => {
    describe("#then it returns a helpful error", () => {
      it("returns error with valid actions listed", async () => {
        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          { action: "delete" },
          {} as Parameters<typeof tool.execute>[1]
        )

        expect(typeof result).toBe("string")
        expect(result).toContain("Unknown action")
        expect(result).toContain("search")
        expect(result).toContain("add-rule")
        expect(result).toContain("metrics")
      })
    })
  })

  describe("#when tool is created", () => {
    describe("#then it has correct metadata", () => {
      it("has description property", () => {
        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        expect(tool.description).toBeDefined()
        expect(typeof tool.description).toBe("string")
      })

      it("has description under 150 tokens", () => {
        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const wordCount = tool.description.split(/\s+/).length
        expect(wordCount).toBeLessThanOrEqual(150)
      })
    })
  })
})
