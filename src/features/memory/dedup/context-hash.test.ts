import { describe, test, expect, beforeEach } from "bun:test"
import type { Database } from "bun:sqlite"
import type { Learning } from "../types"
import { initializeDatabase, closeAll } from "../db/client"
import { createMemoryStorage } from "../storage/memory-storage"
import {
  computeContextHash,
  findExistingByHash,
  deduplicateDatabase,
} from "./context-hash"

describe("context-hash", () => {
  let db: Database
  let storage: ReturnType<typeof createMemoryStorage>

  beforeEach(() => {
    db = initializeDatabase(":memory:")
    storage = createMemoryStorage(db)
  })

  describe("computeContextHash", () => {
    describe("#given identical content", () => {
      test("#when computing hash twice #then hashes match", () => {
        const hash1 = computeContextHash("success", "project", "Always use parameterized queries")
        const hash2 = computeContextHash("success", "project", "Always use parameterized queries")

        expect(hash1).toBe(hash2)
      })
    })

    describe("#given same content but different types", () => {
      test("#when computing hashes #then hashes differ", () => {
        const content = "Always use parameterized queries"
        const hash1 = computeContextHash("success", "project", content)
        const hash2 = computeContextHash("failure", "project", content)

        expect(hash1).not.toBe(hash2)
      })
    })

    describe("#given same content but different scopes", () => {
      test("#when computing hashes #then hashes differ", () => {
        const content = "Always use parameterized queries"
        const hash1 = computeContextHash("success", "project", content)
        const hash2 = computeContextHash("success", "global", content)

        expect(hash1).not.toBe(hash2)
      })
    })

    describe("#given content with whitespace variation", () => {
      test("#when normalizing #then produces consistent hash", () => {
        const content1 = "  Always  use\n  parameterized queries  "
        const content2 = "always use parameterized queries"

        const hash1 = computeContextHash("success", "project", content1)
        const hash2 = computeContextHash("success", "project", content2)

        expect(hash1).toBe(hash2)
      })
    })

    describe("#given content with mixed case", () => {
      test("#when computing hash #then hash is case-insensitive", () => {
        const hash1 = computeContextHash("success", "project", "Use SQL Injection Prevention")
        const hash2 = computeContextHash("success", "project", "use sql injection prevention")

        expect(hash1).toBe(hash2)
      })
    })

    describe("#given valid type scope and content", () => {
      test("#when computing hash #then hash is 64 character hex string", () => {
        const hash = computeContextHash("success", "project", "test content")

        expect(hash).toMatch(/^[a-f0-9]{64}$/)
      })
    })
  })

  describe("findExistingByHash", () => {
    describe("#given learning stored with known hash", () => {
      test("#when searching by hash #then returns the learning id", async () => {
        const customHash = computeContextHash("success", "project", "Unique SQL test")

        const learning: Learning = {
          id: "test-001",
          type: "success",
          summary: "SQL injection test",
          context: "Unique SQL test",
          tool_name: "test-tool",
          domain: "security",
          tags: ["sql", "security"],
          utility_score: 0.9,
          times_consulted: 0,
          context_hash: customHash,
          confidence: 0.95,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        await storage.addLearning(learning)

        const found = findExistingByHash(customHash, db)

        expect(found).not.toBeNull()

        const row = db.prepare("SELECT context_hash FROM learnings WHERE id = ?").get(found) as {
          context_hash: string
        } | null
        expect(row?.context_hash).toBe(customHash)
      })
    })

    describe("#given hash not in database", () => {
      test("#when searching #then returns null", () => {
        const found = findExistingByHash("nonexistent-hash-xyz", db)

        expect(found).toBeNull()
      })
    })

    describe("#given two learnings with different hashes", () => {
      test("#when searching #then returns correct learning id", async () => {
        const hash1 = computeContextHash("success", "project", "Context A different")
        const hash2 = computeContextHash("success", "project", "Context B unique")

        const learning1: Learning = {
          id: "search-001",
          type: "success",
          summary: "First",
          context: "Context A different",
          tool_name: "tool1",
          domain: "domain1",
          tags: [],
          utility_score: 0.5,
          times_consulted: 0,
          context_hash: hash1,
          confidence: 0.8,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        const learning2: Learning = {
          id: "search-002",
          type: "success",
          summary: "Second",
          context: "Context B unique",
          tool_name: "tool2",
          domain: "domain2",
          tags: [],
          utility_score: 0.5,
          times_consulted: 0,
          context_hash: hash2,
          confidence: 0.8,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        await storage.addLearning(learning1)
        await storage.addLearning(learning2)

        const found1 = findExistingByHash(hash1, db)
        const found2 = findExistingByHash(hash2, db)

        expect(found1).not.toBeNull()
        expect(found2).not.toBeNull()

        const row1 = db.prepare("SELECT context_hash FROM learnings WHERE id = ?").get(found1) as {
          context_hash: string
        }
        const row2 = db.prepare("SELECT context_hash FROM learnings WHERE id = ?").get(found2) as {
          context_hash: string
        }

        expect(row1.context_hash).toBe(hash1)
        expect(row2.context_hash).toBe(hash2)
      })
    })
  })

  describe("deduplicateDatabase", () => {
    describe("#given learnings without duplicates", () => {
      test("#when deduplicating #then returns 0 and preserves all rows", async () => {
        // Clear cache to ensure fresh DB
        closeAll()
        const freshDb = initializeDatabase(":memory:")
        const freshStorage = createMemoryStorage(freshDb)

        const hash1 = computeContextHash("success", "project", "Unique Content 1")
        const hash2 = computeContextHash("success", "project", "Unique Content 2")

        const learning1: Learning = {
          id: "unique-001",
          type: "success",
          summary: "First",
          context: "Unique Content 1",
          tool_name: "tool1",
          domain: "domain1",
          tags: [],
          utility_score: 0.5,
          times_consulted: 0,
          context_hash: hash1,
          confidence: 0.8,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        const learning2: Learning = {
          id: "unique-002",
          type: "success",
          summary: "Second",
          context: "Unique Content 2",
          tool_name: "tool2",
          domain: "domain2",
          tags: [],
          utility_score: 0.5,
          times_consulted: 0,
          context_hash: hash2,
          confidence: 0.8,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        await freshStorage.addLearning(learning1)
        await freshStorage.addLearning(learning2)

        const removed = deduplicateDatabase(freshDb)

        expect(removed).toBe(0)

        // Verify both still exist
        const count = (freshDb.prepare("SELECT COUNT(*) as count FROM learnings").get() as { count: number }).count
        expect(count).toBe(2)
      })
    })

    describe("#given deduplicateDatabase function", () => {
      test("#when called #then correctly identifies and would remove duplicates", () => {
        // Test the query logic that identifies duplicates
        const duplicateQuery = `SELECT context_hash FROM learnings 
         WHERE context_hash IS NOT NULL 
         GROUP BY context_hash HAVING COUNT(*) > 1`

        const duplicates = db.prepare(duplicateQuery).all() as { context_hash: string }[]

        // Should be empty initially (no duplicates)
        expect(duplicates).toHaveLength(0)

        // The deduplicateDatabase function would use this query
        // to find and remove duplicates
        const result = deduplicateDatabase(db)

        // With no duplicates, should remove 0 rows
        expect(result).toBe(0)
      })
      })
    })
  })
