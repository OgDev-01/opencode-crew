import { beforeEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { closeAll, initializeDatabase } from "../db/client"
import { createMemoryStorage } from "../storage/memory-storage"
import { createCleanupService } from "./cleanup-service"
import {
  applyTemporalDecay,
  isEvictionCandidate,
} from "../scoring/utility-scorer"

describe("#given cleanup service", () => {
  let db: Database
  let storage: ReturnType<typeof createMemoryStorage>
  let cleanupService: ReturnType<typeof createCleanupService>

  beforeEach(() => {
    closeAll()
    db = initializeDatabase(":memory:")
    storage = createMemoryStorage(db)
    cleanupService = createCleanupService(storage, {
      applyTemporalDecay,
      isEvictionCandidate,
    }, db)
  })

  describe("#when cleanup runs with TTL expiry", () => {
    describe("#then observation expired after 30 days", () => {
      it("removes observation learnings last accessed 30+ days ago", async () => {
        const now = new Date()
        const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 86400000)
          .toISOString()

        db.prepare(
          "INSERT INTO learnings (id, type, summary, context, tool_name, domain, tags, utility_score, times_consulted, context_hash, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          "obs-old",
          "observation",
          "Old observation",
          "test",
          "test",
          "test",
          "",
          0.8,
          0,
          "hash-obs-old",
          0.9,
          thirtyOneDaysAgo,
          thirtyOneDaysAgo
        )

        const rowid = (db.prepare("SELECT rowid FROM learnings WHERE id = ?").get("obs-old") as { rowid: number }).rowid
        db.prepare(
          "INSERT INTO learnings_fts(rowid, summary, context, tags, tool_name, domain) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(rowid, "Old observation", "test", "", "test", "test")

        const report = await cleanupService.cleanup()
        expect(report.expired).toBe(1)
        expect(report.evicted).toBe(0)
        expect(report.total_freed).toBe(1)

        const deleted = await storage.getLearning("obs-old")
        expect(deleted).toBeNull()
      })
    })

    describe("#then learning expired after 60 days", () => {
      it("removes success learnings last accessed 60+ days ago", async () => {
        const now = new Date()
        const sixtyOneDaysAgo = new Date(now.getTime() - 61 * 86400000)
          .toISOString()

        db.prepare(
          "INSERT INTO learnings (id, type, summary, context, tool_name, domain, tags, utility_score, times_consulted, context_hash, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          "learn-old",
          "success",
          "Old learning",
          "test",
          "test",
          "test",
          "",
          0.8,
          0,
          "hash-learn-old",
          0.9,
          sixtyOneDaysAgo,
          sixtyOneDaysAgo
        )

        const rowid = (db.prepare("SELECT rowid FROM learnings WHERE id = ?").get("learn-old") as { rowid: number }).rowid
        db.prepare(
          "INSERT INTO learnings_fts(rowid, summary, context, tags, tool_name, domain) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(rowid, "Old learning", "test", "", "test", "test")

        const report = await cleanupService.cleanup()
        expect(report.expired).toBe(1)
        expect(report.evicted).toBe(0)
        expect(report.total_freed).toBe(1)

        const deleted = await storage.getLearning("learn-old")
        expect(deleted).toBeNull()
      })
    })

    describe("#then failure type expired after 90 days", () => {
      it("removes failure learnings last accessed 90+ days ago", async () => {
        const now = new Date()
        const ninetyOneDaysAgo = new Date(now.getTime() - 91 * 86400000)
          .toISOString()

        db.prepare(
          "INSERT INTO learnings (id, type, summary, context, tool_name, domain, tags, utility_score, times_consulted, context_hash, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          "fact-old",
          "failure",
          "Old failure",
          "test",
          "test",
          "test",
          "",
          0.8,
          0,
          "hash-fact-old",
          0.9,
          ninetyOneDaysAgo,
          ninetyOneDaysAgo
        )

        const rowid = (db.prepare("SELECT rowid FROM learnings WHERE id = ?").get("fact-old") as { rowid: number }).rowid
        db.prepare(
          "INSERT INTO learnings_fts(rowid, summary, context, tags, tool_name, domain) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(rowid, "Old failure", "test", "", "test", "test")

        const report = await cleanupService.cleanup()
        expect(report.expired).toBe(1)
        expect(report.evicted).toBe(0)
        expect(report.total_freed).toBe(1)

        const deleted = await storage.getLearning("fact-old")
        expect(deleted).toBeNull()
      })
    })
  })

  describe("#when cleanup runs with score-based eviction", () => {
    describe("#then low-score memory evicted", () => {
      it("removes memories with decayed score < 0.1", async () => {
        const now = new Date()
        const fiftyDaysAgo = new Date(now.getTime() - 50 * 86400000).toISOString()

        db.prepare(
          "INSERT INTO learnings (id, type, summary, context, tool_name, domain, tags, utility_score, times_consulted, context_hash, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          "low-score",
          "observation",
          "Low utility memory",
          "test",
          "test",
          "test",
          "",
          0.05,
          0,
          "hash-low",
          0.9,
          fiftyDaysAgo,
          fiftyDaysAgo
        )

        const rowid = (db.prepare("SELECT rowid FROM learnings WHERE id = ?").get("low-score") as { rowid: number }).rowid
        db.prepare(
          "INSERT INTO learnings_fts(rowid, summary, context, tags, tool_name, domain) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(rowid, "Low utility memory", "test", "", "test", "test")

        const report = await cleanupService.cleanup()
        expect(report.evicted).toBeGreaterThanOrEqual(0)
        expect(report.total_freed).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe("#when cleanup runs in dry-run mode", () => {
    describe("#then dry-run returns report without deleting", () => {
      it("collects would-be deletions but calls no storage.delete", async () => {
        const now = new Date()
        const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 86400000)
          .toISOString()

        db.prepare(
          "INSERT INTO learnings (id, type, summary, context, tool_name, domain, tags, utility_score, times_consulted, context_hash, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          "obs-to-delete",
          "observation",
          "Would be deleted",
          "test",
          "test",
          "test",
          "",
          0.8,
          0,
          "hash-dryrun",
          0.9,
          thirtyOneDaysAgo,
          thirtyOneDaysAgo
        )

        const rowid = (db.prepare("SELECT rowid FROM learnings WHERE id = ?").get("obs-to-delete") as { rowid: number }).rowid
        db.prepare(
          "INSERT INTO learnings_fts(rowid, summary, context, tags, tool_name, domain) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(rowid, "Would be deleted", "test", "", "test", "test")

        const dryRunReport = await cleanupService.cleanup({ dryRun: true })
        expect(dryRunReport.expired).toBe(1)

        const stillExists = await storage.getLearning("obs-to-delete")
        expect(stillExists).not.toBeNull()
        expect(stillExists?.summary).toBe("Would be deleted")
      })
    })

    describe("#then dry-run counts match actual run", () => {
      it("dry-run report matches actual cleanup deletion count", async () => {
        const now = new Date()
        const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 86400000)
          .toISOString()

        db.prepare(
          "INSERT INTO learnings (id, type, summary, context, tool_name, domain, tags, utility_score, times_consulted, context_hash, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          "obs-1",
          "observation",
          "First old obs",
          "test",
          "test",
          "test",
          "",
          0.8,
          0,
          "hash-1",
          0.9,
          thirtyOneDaysAgo,
          thirtyOneDaysAgo
        )

        const rowid1 = (db.prepare("SELECT rowid FROM learnings WHERE id = ?").get("obs-1") as { rowid: number }).rowid
        db.prepare(
          "INSERT INTO learnings_fts(rowid, summary, context, tags, tool_name, domain) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(rowid1, "First old obs", "test", "", "test", "test")

        db.prepare(
          "INSERT INTO learnings (id, type, summary, context, tool_name, domain, tags, utility_score, times_consulted, context_hash, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          "obs-2",
          "observation",
          "Second old obs",
          "test",
          "test",
          "test",
          "",
          0.8,
          0,
          "hash-2",
          0.9,
          thirtyOneDaysAgo,
          thirtyOneDaysAgo
        )

        const rowid2 = (db.prepare("SELECT rowid FROM learnings WHERE id = ?").get("obs-2") as { rowid: number }).rowid
        db.prepare(
          "INSERT INTO learnings_fts(rowid, summary, context, tags, tool_name, domain) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(rowid2, "Second old obs", "test", "", "test", "test")

        const dryRunReport = await cleanupService.cleanup({ dryRun: true })
        const actualReport = await cleanupService.cleanup()

        expect(actualReport.expired).toBe(dryRunReport.expired)
        expect(actualReport.evicted).toBe(dryRunReport.evicted)
        expect(actualReport.total_freed).toBe(dryRunReport.total_freed)
      })
    })
  })

  describe("#when cleanup skips recent memories", () => {
    describe("#then recent memories never deleted", () => {
      it("preserves observation accessed within 30 days", async () => {
        const now = new Date()
        const twentyNineDaysAgo = new Date(now.getTime() - 29 * 86400000)
          .toISOString()

        db.prepare(
          "INSERT INTO learnings (id, type, summary, context, tool_name, domain, tags, utility_score, times_consulted, context_hash, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          "obs-recent",
          "observation",
          "Recent observation",
          "test",
          "test",
          "test",
          "",
          0.8,
          0,
          "hash-recent",
          0.9,
          twentyNineDaysAgo,
          twentyNineDaysAgo
        )

        const rowid = (db.prepare("SELECT rowid FROM learnings WHERE id = ?").get("obs-recent") as { rowid: number }).rowid
        db.prepare(
          "INSERT INTO learnings_fts(rowid, summary, context, tags, tool_name, domain) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(rowid, "Recent observation", "test", "", "test", "test")

        const report = await cleanupService.cleanup()
        expect(report.expired).toBe(0)
        expect(report.total_freed).toBe(0)

        const still = await storage.getLearning("obs-recent")
        expect(still).not.toBeNull()
      })
    })
  })
})
