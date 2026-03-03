import { beforeEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { closeAll, initializeDatabase } from "../db/client"
import { createSearchService } from "./search-service"
import { createMemoryStorage } from "../storage/memory-storage"

describe("#given memory search service", () => {
  let db: Database

  beforeEach(() => {
    closeAll()
    db = initializeDatabase(":memory:")
  })

  describe("#when searching learnings with ranked FTS5", () => {
    describe("#then it returns higher relevance first with mapped fields", () => {
      it("returns ranked learning results with public fields", async () => {
        const storage = createMemoryStorage(db)
        await storage.addLearning({
          id: "ignore-1",
          type: "success",
          summary: "React hook patterns for useState",
          context: "ui",
          tool_name: "Read",
          domain: "frontend",
          tags: ["react"],
          utility_score: 0.9,
          times_consulted: 0,
          context_hash: "ctx-ranked-1",
          confidence: 0.8,
          created_at: "",
          updated_at: "",
        })
        await storage.addLearning({
          id: "ignore-2",
          type: "observation",
          summary: "React hook pitfalls with useState",
          context: "ui",
          tool_name: "Read",
          domain: "frontend",
          tags: ["react"],
          utility_score: 0.1,
          times_consulted: 0,
          context_hash: "ctx-ranked-2",
          confidence: 0.5,
          created_at: "",
          updated_at: "",
        })

        db.prepare("UPDATE learnings SET updated_at = datetime('now') WHERE context_hash = ?").run("ctx-ranked-1")
        db.prepare("UPDATE learnings SET updated_at = datetime('now', '-365 days') WHERE context_hash = ?").run("ctx-ranked-2")

        const service = createSearchService(db)
        const results = await service.searchLearnings("react hook useState", {
          minRelevance: 0,
          maxResults: 10,
        })

        expect(results.length).toBe(2)
        expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0)

        const first = results[0] as unknown as Record<string, unknown>
        expect(first.type).toBe("learning")
        expect(first.content).toBe("React hook patterns for useState")
        expect(first.id).toBeString()
      })
    })
  })

  describe("#when applying minimum relevance threshold", () => {
    describe("#then low relevance matches are filtered out", () => {
      it("filters lower scored learning rows", async () => {
        const storage = createMemoryStorage(db)
        await storage.addLearning({
          id: "ignore-3",
          type: "success",
          summary: "Deterministic CI tests",
          context: "ci",
          tool_name: "Bash",
          domain: "testing",
          tags: ["ci"],
          utility_score: 0.9,
          times_consulted: 0,
          context_hash: "ctx-threshold-1",
          confidence: 0.9,
          created_at: "",
          updated_at: "",
        })
        await storage.addLearning({
          id: "ignore-4",
          type: "failure",
          summary: "Deterministic CI tests",
          context: "legacy",
          tool_name: "Bash",
          domain: "testing",
          tags: ["ci"],
          utility_score: 0.0,
          times_consulted: 0,
          context_hash: "ctx-threshold-2",
          confidence: 0.3,
          created_at: "",
          updated_at: "",
        })

        db.prepare("UPDATE learnings SET updated_at = datetime('now') WHERE context_hash = ?").run("ctx-threshold-1")
        db.prepare("UPDATE learnings SET updated_at = datetime('now', '-730 days') WHERE context_hash = ?").run("ctx-threshold-2")

        const service = createSearchService(db)
        const results = await service.searchLearnings("deterministic CI tests", {
          minRelevance: 0.3,
          maxResults: 10,
        })

        expect(results).toHaveLength(1)
        const only = results[0] as unknown as Record<string, unknown>
        expect(only.content).toBe("Deterministic CI tests")
      })
    })
  })

  describe("#when searching across learnings and golden rules", () => {
    describe("#then it can return both entry types", () => {
      it("returns combined results from searchAll", async () => {
        const storage = createMemoryStorage(db)
        await storage.addLearning({
          id: "ignore-5",
          type: "observation",
          summary: "Prefer explicit TypeScript return types",
          context: "compiler",
          tool_name: "Read",
          domain: "typescript",
          tags: ["ts"],
          utility_score: 0.7,
          times_consulted: 0,
          context_hash: "ctx-all-1",
          confidence: 0.8,
          created_at: "",
          updated_at: "",
        })
        await storage.addGoldenRule({
          id: "ignore-6",
          rule: "Prefer explicit TypeScript return types",
          domain: "typescript",
          confidence: 0.95,
          times_validated: 5,
          times_violated: 0,
          source_learning_ids: ["a"],
          created_at: "",
          updated_at: "",
        })

        const service = createSearchService(db)
        const results = await service.searchAll("TypeScript return types", {
          minRelevance: 0,
          maxResults: 10,
        })
        const types = new Set(results.map((item) => item.type))

        expect(results.length).toBeGreaterThanOrEqual(2)
        expect(types.has("learning")).toBeTrue()
        expect(types.has("golden_rule")).toBeTrue()
      })
    })
  })

  describe("#when searching golden rules with empty query", () => {
    describe("#then it returns all golden rules without FTS5", () => {
      it("returns golden rules via plain SELECT fallback", async () => {
        const storage = createMemoryStorage(db)
        await storage.addGoldenRule({
          id: "gr-empty-1",
          rule: "Always use bun:test with given/when/then style",
          domain: "testing",
          confidence: 0.95,
          times_validated: 5,
          times_violated: 0,
          source_learning_ids: ["a"],
          created_at: "",
          updated_at: "",
        })
        await storage.addGoldenRule({
          id: "gr-empty-2",
          rule: "Never use as any or @ts-ignore",
          domain: "typescript",
          confidence: 0.9,
          times_validated: 3,
          times_violated: 0,
          source_learning_ids: ["b"],
          created_at: "",
          updated_at: "",
        })

        const service = createSearchService(db)
        const results = await service.searchGoldenRules("", {
          maxResults: 10,
          minRelevance: 0,
        })

        expect(results.length).toBe(2)
        expect(results[0]?.type).toBe("golden_rule")
        expect(results[1]?.type).toBe("golden_rule")
      })
    })
  })
})
