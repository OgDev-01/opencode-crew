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
        const stored = await storage.getLearning(parsed.results[0].id)
        expect(stored?.times_consulted).toBe(1)
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
        expect(await storage.getLearning(parsed.id)).not.toBeNull()
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
        const stored = await storage.getGoldenRules("global")
        expect(stored.some((rule) => rule.id === parsed.id)).toBeTrue()
      })

      it("does not apply hash-based dedup to golden rules", async () => {
        const deps = {
          ...makeDeps(db),
          findExistingByHash: (_hash: string, _db: Database) => "existing-golden-rule-id",
        }
        const tool = createElfTool(deps)

        const result = await tool.execute(
          {
            action: "add-rule",
            content: "Always validate config before startup",
            type: "golden_rule",
            scope: "project",
          },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.status).toBe("added")
        expect(parsed.deduplicated).toBe(false)

        const stored = await storage.getGoldenRules("project")
        expect(stored).toHaveLength(1)
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

  describe("#when action is delete-rule", () => {
    describe("#then it removes memory items and returns confirmation", () => {
      it("deletes a learning by ID", async () => {
        const learningId = crypto.randomUUID()
        await storage.addLearning({
          id: learningId,
          type: "success",
          summary: "Deletion test learning",
          context: "testing",
          tool_name: "Test",
          domain: "project",
          tags: [],
          utility_score: 0.5,
          times_consulted: 0,
          context_hash: "hash-delete-learning-1",
          confidence: 0.7,
          created_at: "",
          updated_at: "",
        })

        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          { action: "delete-rule", id: learningId },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.status).toBe("deleted")
        expect(parsed.type).toBe("learning")
        expect(parsed.id).toBe(learningId)
        expect(await storage.getLearning(learningId)).toBeNull()
      })

      it("deletes a golden_rule by ID", async () => {
        const ruleId = crypto.randomUUID()
        await storage.addGoldenRule({
          id: ruleId,
          rule: "Always validate input",
          domain: "project",
          confidence: 0.9,
          times_validated: 0,
          times_violated: 0,
          source_learning_ids: [],
          created_at: "",
          updated_at: "",
        })

        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          { action: "delete-rule", id: ruleId, type: "golden_rule" },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.status).toBe("deleted")
        expect(parsed.type).toBe("golden_rule")
      })

      it("returns not_found for nonexistent ID", async () => {
        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const fakeId = crypto.randomUUID()
        const result = await tool.execute(
          { action: "delete-rule", id: fakeId },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.status).toBe("not_found")
        expect(parsed.error).toContain("not found")
      })

      it("returns error when id is missing", async () => {
        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          { action: "delete-rule" },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.error).toContain("id is required")
      })

      it("auto-detects type when not specified", async () => {
        const ruleId = crypto.randomUUID()
        await storage.addGoldenRule({
          id: ruleId,
          rule: "Always use golden rules",
          domain: "global",
          confidence: 0.9,
          times_validated: 0,
          times_violated: 0,
          source_learning_ids: [],
          created_at: "",
          updated_at: "",
        })

        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          { action: "delete-rule", id: ruleId },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.status).toBe("deleted")
        expect(parsed.type).toBe("golden_rule")
      })
    })
  })

  describe("#when action is update-rule", () => {
    describe("#then it updates memory items with validation", () => {
      it("updates a learning's content", async () => {
        const learningId = crypto.randomUUID()
        await storage.addLearning({
          id: learningId,
          type: "observation",
          summary: "Original content",
          context: "testing",
          tool_name: "Test",
          domain: "project",
          tags: [],
          utility_score: 0.5,
          times_consulted: 0,
          context_hash: "hash-update-learning-1",
          confidence: 0.7,
          created_at: "",
          updated_at: "",
        })

        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          { action: "update-rule", id: learningId, content: "Updated content" },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.status).toBe("updated")
        expect(parsed.type).toBe("learning")
        const updated = await storage.getLearning(learningId)
        expect(updated?.summary).toBe("Updated content")
      })

      it("updates a golden_rule's content", async () => {
        const ruleId = crypto.randomUUID()
        await storage.addGoldenRule({
          id: ruleId,
          rule: "Original rule",
          domain: "project",
          confidence: 0.9,
          times_validated: 0,
          times_violated: 0,
          source_learning_ids: [],
          created_at: "",
          updated_at: "",
        })

        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          { action: "update-rule", id: ruleId, content: "Updated rule", type: "golden_rule" },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.status).toBe("updated")
        expect(parsed.type).toBe("golden_rule")
        const updated = await storage.getGoldenRule(ruleId)
        expect(updated?.rule).toBe("Updated rule")
      })

      it("returns not_found for nonexistent ID", async () => {
        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const fakeId = crypto.randomUUID()
        const result = await tool.execute(
          { action: "update-rule", id: fakeId, content: "New content" },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.status).toBe("not_found")
        expect(parsed.error).toContain("not found")
      })

      it("returns error when id is missing", async () => {
        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          { action: "update-rule", content: "Content without ID" },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.error).toContain("id is required")
      })

      it("returns error when content is missing", async () => {
        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          { action: "update-rule", id: crypto.randomUUID() },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.error).toContain("content is required")
      })

      it("applies privacy filter before updating", async () => {
        const learningId = crypto.randomUUID()
        await storage.addLearning({
          id: learningId,
          type: "observation",
          summary: "Original",
          context: "testing",
          tool_name: "Test",
          domain: "project",
          tags: [],
          utility_score: 0.5,
          times_consulted: 0,
          context_hash: "hash-privacy-filter-1",
          confidence: 0.7,
          created_at: "",
          updated_at: "",
        })

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
          { action: "update-rule", id: learningId, content: "Found key AKIAIOSFODNN7EXAMPLE in config" },
          {} as Parameters<typeof tool.execute>[1]
        )

        expect(filteredContent).toContain("[REDACTED]")
        const updated = await storage.getLearning(learningId)
        expect(updated?.summary).toContain("[REDACTED]")
      })

      it("rejects memory-dump shaped content", async () => {
        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          {
            action: "update-rule",
            id: crypto.randomUUID(),
            content: "## Agent Memory\n### Golden Rules\n- Rule A\n### Learnings\n- Item B\ntotalMemories: 4\nbyType: {'learnings':1,'golden_rules':3}",
          },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.status).toBe("rejected")
        expect(parsed.error).toContain("memory dump")
      })

      it("updates scope when provided", async () => {
        const learningId = crypto.randomUUID()
        await storage.addLearning({
          id: learningId,
          type: "observation",
          summary: "Original with project scope",
          context: "testing",
          tool_name: "Test",
          domain: "project",
          tags: [],
          utility_score: 0.5,
          times_consulted: 0,
          context_hash: "hash-scope-update-1",
          confidence: 0.7,
          created_at: "",
          updated_at: "",
        })

        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          { action: "update-rule", id: learningId, content: "Updated content", scope: "global" },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.status).toBe("updated")
        const updated = await storage.getLearning(learningId)
        expect(updated?.domain).toBe("global")
      })

      it("auto-detects type when not specified", async () => {
        const ruleId = crypto.randomUUID()
        await storage.addGoldenRule({
          id: ruleId,
          rule: "Auto-detect test",
          domain: "project",
          confidence: 0.9,
          times_validated: 0,
          times_violated: 0,
          source_learning_ids: [],
          created_at: "",
          updated_at: "",
        })

        const deps = makeDeps(db)
        const tool = createElfTool(deps)
        const result = await tool.execute(
          { action: "update-rule", id: ruleId, content: "Updated without type" },
          {} as Parameters<typeof tool.execute>[1]
        )

        const parsed = JSON.parse(result as string)
        expect(parsed.status).toBe("updated")
        expect(parsed.type).toBe("golden_rule")
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
        expect(result).toContain("delete-rule")
        expect(result).toContain("update-rule")
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
