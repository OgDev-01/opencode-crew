import { beforeEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { closeAll, initializeDatabase } from "../db/client"
import { createMemoryStorage } from "./memory-storage"

describe("#given memory storage", () => {
  let db: Database
  let storage: ReturnType<typeof createMemoryStorage>

  beforeEach(() => {
    closeAll()
    db = initializeDatabase(":memory:")
    storage = createMemoryStorage(db)
  })

  describe("#when adding and reading a learning", () => {
    describe("#then", () => {
      it("stores the row and allows retrieval by id", async () => {
        await storage.addLearning({
          id: "caller-provided-id",
          type: "success",
          summary: "Use bun:test for unit tests",
          context: "task 7",
          tool_name: "Bash",
          domain: "testing",
          tags: ["bun", "test"],
          utility_score: 0.6,
          times_consulted: 0,
          context_hash: "ctx-1",
          confidence: 0.7,
          created_at: "",
          updated_at: "",
        })

        const row = db
          .prepare("SELECT id FROM learnings WHERE summary = ?")
          .get("Use bun:test for unit tests") as { id: string } | null

        expect(row).not.toBeNull()
        expect(row?.id).toBe("caller-provided-id")

        const learning = await storage.getLearning(row!.id)
        expect(learning?.summary).toBe("Use bun:test for unit tests")
        expect(learning?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      })
    })
  })

  describe("#when syncing FTS after insert and update", () => {
    describe("#then", () => {
      it("indexes inserted learnings and refreshes index on update", async () => {
        await storage.addLearning({
          id: "ignored",
          type: "observation",
          summary: "TypeScript generic constraints",
          context: "initial",
          tool_name: "Read",
          domain: "typescript",
          tags: ["generic"],
          utility_score: 0.3,
          times_consulted: 0,
          context_hash: "ctx-2",
          confidence: 0.5,
          created_at: "",
          updated_at: "",
        })

        const insertedId = db
          .prepare("SELECT id FROM learnings WHERE context_hash = ?")
          .get("ctx-2") as { id: string }

        const insertedMatches = db
          .prepare("SELECT rowid FROM learnings_fts WHERE learnings_fts MATCH ?")
          .all("TypeScript")
        expect(insertedMatches.length).toBe(1)

        await storage.updateLearning(insertedId.id, { summary: "Rust ownership model" })

        const newMatches = db
          .prepare("SELECT rowid FROM learnings_fts WHERE learnings_fts MATCH ?")
          .all("ownership")
        const updatedLearning = await storage.getLearning(insertedId.id)

        expect(newMatches.length).toBe(1)
        expect(updatedLearning?.summary).toBe("Rust ownership model")
      })
    })
  })

  describe("#when deleting a learning", () => {
    describe("#then", () => {
      it("removes content row and FTS row", async () => {
        await storage.addLearning({
          id: "ignored",
          type: "failure",
          summary: "Debug flaky test",
          context: "ci",
          tool_name: "Bash",
          domain: "debugging",
          tags: ["ci"],
          utility_score: 0.4,
          times_consulted: 0,
          context_hash: "ctx-3",
          confidence: 0.6,
          created_at: "",
          updated_at: "",
        })

        const learningId = db
          .prepare("SELECT id FROM learnings WHERE context_hash = ?")
          .get("ctx-3") as { id: string }

        await storage.deleteLearning(learningId.id)

        expect(await storage.getLearning(learningId.id)).toBeNull()
        const ftsMatches = db
          .prepare("SELECT rowid FROM learnings_fts WHERE learnings_fts MATCH ?")
          .all("flaky")
        expect(ftsMatches.length).toBe(0)
      })
    })
  })

  describe("#when adding golden rules and reading stats", () => {
    describe("#then", () => {
      it("filters golden rules by domain and reports counts", async () => {
        await storage.addGoldenRule({
          id: "testing-rule-id",
          rule: "Prefer deterministic tests",
          domain: "testing",
          confidence: 0.9,
          times_validated: 3,
          times_violated: 0,
          source_learning_ids: ["a", "b"],
          created_at: "",
          updated_at: "",
        })
        await storage.addGoldenRule({
          id: "database-rule-id",
          rule: "Batch database writes in transactions",
          domain: "database",
          confidence: 0.8,
          times_validated: 2,
          times_violated: 0,
          source_learning_ids: ["c"],
          created_at: "",
          updated_at: "",
        })

        const testingRules = await storage.getGoldenRules("testing")
        expect(testingRules).toHaveLength(1)
        expect(testingRules[0]?.rule).toBe("Prefer deterministic tests")

        const stats = (await storage.getStats()) as {
          learnings: number
          goldenRules: number
          oldestLearning: Date | null
        }
        expect(stats.learnings).toBe(0)
        expect(stats.goldenRules).toBe(2)
        expect(stats.oldestLearning).toBeNull()
      })
    })
  })
})
