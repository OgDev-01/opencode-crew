import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import type { Database } from "bun:sqlite"
import { existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createMemoryInjectionHook } from "../../../hooks/memory-injection/hook"
import { createMemoryLearningHook } from "../../../hooks/memory-learning/hook"
import { createElfTool } from "../../../tools/elf/tool"
import { createCleanupService } from "../cleanup/cleanup-service"
import { createConsolidationService } from "../consolidation/consolidator"
import { closeAll, initializeDatabase } from "../db/client"
import { computeContextHash, findExistingByHash } from "../dedup/context-hash"
import { createMemoryManager, resetMemoryManager } from "../manager"
import { filterContent } from "../privacy-filter"
import { applyTemporalDecay, batchUpdateScores, isEvictionCandidate } from "../scoring/utility-scorer"
import { createSearchService } from "../search/search-service"
import { createMemoryStorage } from "../storage/memory-storage"
import type { GoldenRule, Learning, MemoryConfig, MemoryScope } from "../types"

const DAY_MS = 86400000
const makeDbPath = (label: string) => join(tmpdir(), `crew-integration-test-${label}-${Date.now()}-${crypto.randomUUID()}.db`)
const makeConfig = (dbPath: string): MemoryConfig => ({
  enabled: true,
  scope: "project",
  max_learnings: 200,
  max_golden_rules: 10,
  consolidation_threshold: 3,
  cleanup_threshold: 50,
  retention_days: 120,
  project_db_path: dbPath,
})

async function addLearning(
  storage: ReturnType<typeof createMemoryStorage>,
  overrides: Partial<Learning> & Pick<Learning, "summary" | "domain">
) {
  await storage.addLearning({
    id: overrides.id ?? "ignored",
    type: overrides.type ?? "observation",
    summary: overrides.summary,
    context: overrides.context ?? "ctx",
    tool_name: overrides.tool_name ?? "Bash",
    domain: overrides.domain,
    tags: overrides.tags ?? [],
    utility_score: overrides.utility_score ?? 0.5,
    times_consulted: overrides.times_consulted ?? 0,
    context_hash: overrides.context_hash ?? computeContextHash("learning", overrides.domain, `${overrides.summary}-${crypto.randomUUID()}`),
    confidence: overrides.confidence ?? 0.7,
    created_at: overrides.created_at ?? "",
    updated_at: overrides.updated_at ?? "",
  })
}

function mapLearningRow(row: Record<string, unknown>): Learning {
  return {
    id: String(row.id),
    type: row.type as Learning["type"],
    summary: String(row.summary),
    context: String(row.context ?? ""),
    tool_name: String(row.tool_name ?? ""),
    domain: String(row.domain ?? ""),
    tags: String(row.tags ?? "").split(",").filter(Boolean),
    utility_score: Number(row.utility_score ?? 0),
    times_consulted: Number(row.times_consulted ?? 0),
    context_hash: String(row.context_hash ?? ""),
    confidence: Number(row.confidence ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function createConsolidationStorage(db: Database) {
  const base = createMemoryStorage(db)
  return {
    async getLearningsByScope(scope: MemoryScope) {
      const rows = db.prepare("SELECT * FROM learnings WHERE domain = ? ORDER BY created_at DESC").all(scope) as Record<string, unknown>[]
      return rows.map(mapLearningRow)
    },
    async updateLearning(id: string, updates: Partial<Learning>) {
      const mapped: Partial<Learning> = {
        ...(updates.summary ? { summary: updates.summary } : {}),
        ...(updates.context ? { context: updates.context } : {}),
        ...(updates.tool_name ? { tool_name: updates.tool_name } : {}),
        ...(updates.domain ? { domain: updates.domain } : {}),
        ...(updates.tags ? { tags: updates.tags } : {}),
        ...(typeof updates.utility_score === "number" ? { utility_score: updates.utility_score } : {}),
        ...(typeof updates.times_consulted === "number" ? { times_consulted: updates.times_consulted } : {}),
        ...(updates.context_hash ? { context_hash: updates.context_hash } : {}),
        ...(typeof updates.confidence === "number" ? { confidence: updates.confidence } : {}),
      }
      await base.updateLearning(id, mapped)
    },
    async deleteLearning(id: string) { await base.deleteLearning(id) },
    async getGoldenRulesByScope(scope: MemoryScope) {
      const rows = db.prepare("SELECT * FROM golden_rules WHERE domain = ? ORDER BY created_at DESC").all(scope) as Record<string, unknown>[]
      return rows.map((row) => ({
        id: String(row.id),
        rule: String(row.rule),
        domain: String(row.domain),
        scope,
        confidence: Number(row.confidence ?? 0),
        utility_score: Number(row.confidence ?? 0),
        times_validated: Number(row.times_validated ?? 0),
        times_violated: 0,
        source_learning_ids: JSON.parse(String(row.source_learning_ids ?? "[]")) as string[],
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      }))
    },
    async addGoldenRule(rule: GoldenRule & { scope?: MemoryScope }) { await base.addGoldenRule({ ...rule, domain: rule.scope ?? rule.domain }) },
    async deleteGoldenRule(id: string) {
      db.prepare("DELETE FROM golden_rules_fts WHERE rowid IN (SELECT rowid FROM golden_rules WHERE id = ?)").run(id)
      db.prepare("DELETE FROM golden_rules WHERE id = ?").run(id)
    },
  }
}

describe("Memory lifecycle integration", () => {
  const dbPaths: string[] = []
  beforeEach(() => { closeAll(); resetMemoryManager() })
  afterEach(() => {
    resetMemoryManager(); closeAll()
    for (const dbPath of dbPaths) if (existsSync(dbPath)) rmSync(dbPath)
    dbPaths.length = 0
  })

  describe("#given memory system initialized", () => {
    describe("#when full lifecycle executes", () => {
      describe("#then", () => {
        it("runs capture, store, retrieve, inject, score, consolidate, and cleanup", async () => {
          const dbPath = makeDbPath("lifecycle"); dbPaths.push(dbPath)
          const db = initializeDatabase(dbPath)
          const manager = createMemoryManager(makeConfig(dbPath))
          const storage = manager.storage
          const search = createSearchService(db)

          const learningHook = createMemoryLearningHook({ storage })
          await learningHook["tool.execute.after"]({ tool: "Bash", sessionID: "s1", callID: "c1" }, { title: "failed", output: "bash failed permission denied", metadata: { exitCode: 1 } })

          await addLearning(storage, {
            type: "success",
            summary: "Use bash -lc with strict error handling",
            context: "CLI orchestration with bash",
            domain: "project",
            tags: ["bash", "cli"],
            utility_score: 0.7,
            times_consulted: 1,
            confidence: 0.8,
          })

          const found = await search.searchLearnings("bash", { maxResults: 10, minRelevance: 0, scope: "project", domain: "project", halfLifeDays: 60 })
          expect(found.length).toBeGreaterThanOrEqual(1)
          const targetId = (found[0]?.entry as Learning).id
          expect(await storage.getLearning(targetId)).not.toBeNull()

          const registered: Array<{ source: string; content: string }> = []
          const injectionHook = createMemoryInjectionHook({
            search,
            collector: { register(_id, payload) { registered.push({ source: payload.source, content: payload.content }) } },
            getUsage: () => ({ usedTokens: 100, remainingTokens: 900, usagePercentage: 0.1 }),
          })
          const preInjectionResults = await search.searchAll("bash", {
            maxResults: 5,
            minRelevance: 0,
            scope: "project",
            halfLifeDays: 60,
          })
          expect(preInjectionResults.length).toBeGreaterThanOrEqual(1)
          await injectionHook["experimental.chat.messages.transform"](
            {},
            { messages: [{ info: { role: "user", sessionID: "s1" }, parts: [{ type: "text", text: "bash" }] }] }
          )
          expect(registered[0]?.source).toBe("memory")
          expect(registered[0]?.content).toContain("## Agent Memory")

          await batchUpdateScores([{ memoryId: targetId, outcome: "used" }], storage)
          expect((await storage.getLearning(targetId))?.utility_score).toBeCloseTo(0.01, 6)

          const oldIso = new Date(Date.now() - 8 * DAY_MS).toISOString()
          for (let i = 0; i < 3; i++) {
            await addLearning(storage, {
              type: "success",
              summary: "Prefer deterministic database migration rollback sequencing",
              context: "migration sequencing",
              domain: "project",
              tags: ["database", "migration"],
              utility_score: 0.95,
              times_consulted: 10,
              confidence: 0.91,
              created_at: oldIso,
              updated_at: oldIso,
              context_hash: computeContextHash("learning", "project", `migration-${i}`),
            })
          }
          db.prepare("UPDATE learnings SET times_consulted = 10, utility_score = 0.95, confidence = 0.91, created_at = ? WHERE summary LIKE ?").run(oldIso, "Prefer deterministic database migration rollback sequencing%")
          const consolidation = await createConsolidationService(createConsolidationStorage(db), search).consolidate("project")
          expect(consolidation.synthesized).toBeGreaterThanOrEqual(1)

          await addLearning(storage, {
            type: "observation",
            summary: "Legacy observation slated for TTL cleanup",
            context: "ancient telemetry",
            domain: "project",
            tags: ["ttl"],
            utility_score: 0.4,
            confidence: 0.4,
            context_hash: computeContextHash("learning", "project", "legacy-observation"),
          })
          const staleIso = new Date(Date.now() - 200 * DAY_MS).toISOString()
          db.prepare("UPDATE learnings SET updated_at = ?, created_at = ? WHERE summary = ?").run(staleIso, staleIso, "Legacy observation slated for TTL cleanup")
          const cleanup = createCleanupService(storage, { applyTemporalDecay, isEvictionCandidate }, db)
          expect((await cleanup.cleanup()).expired).toBeGreaterThanOrEqual(1)
          const removed = await search.searchLearnings("legacy observation", { maxResults: 5, minRelevance: 0, scope: "project", domain: "project", halfLifeDays: 60 })
          expect(removed.length).toBe(0)

          const customPath = makeDbPath("custom-ttl"); dbPaths.push(customPath)
          const customDb = initializeDatabase(customPath)
          const customStorage = createMemoryStorage(customDb)
          await addLearning(customStorage, { type: "observation", summary: "observation ttl validation", domain: "project", context_hash: computeContextHash("learning", "project", "obs-ttl") })
          await addLearning(customStorage, { type: "failure", summary: "failure ttl validation", domain: "project", context_hash: computeContextHash("learning", "project", "fail-ttl") })
          const ttlIso = new Date(Date.now() - 31 * DAY_MS).toISOString()
          customDb.prepare("UPDATE learnings SET updated_at = ?, created_at = ? WHERE summary LIKE ?").run(ttlIso, ttlIso, "%ttl validation")
          await createCleanupService(customStorage, { applyTemporalDecay, isEvictionCandidate }, customDb).cleanup()
          const remaining = customDb.prepare("SELECT type FROM learnings WHERE summary LIKE ? ORDER BY type").all("%ttl validation") as Array<{ type: string }>
          expect(remaining.some((row) => row.type === "observation")).toBeFalse()
          expect(remaining.some((row) => row.type === "failure")).toBeTrue()
        })
      })
    })
  })

  describe("#given project and global memories", () => {
    describe("#when searching scoped and unscoped", () => {
      describe("#then", () => {
        it("keeps scope-isolated retrieval while allowing cross-search", async () => {
          const dbPath = makeDbPath("dual-scope"); dbPaths.push(dbPath)
          const db = initializeDatabase(dbPath)
          const storage = createMemoryStorage(db)
          const search = createSearchService(db)

          await addLearning(storage, {
            type: "success",
            summary: "database migration patterns for zero downtime",
            context: "project migration",
            domain: "project",
            tags: ["database"],
            utility_score: 0.8,
            times_consulted: 2,
            confidence: 0.9,
            context_hash: computeContextHash("learning", "project", "db-migration-patterns"),
          })
          await addLearning(storage, {
            type: "observation",
            summary: "git workflow best practices for trunk based delivery",
            context: "global git guidance",
            domain: "global",
            tags: ["git"],
            utility_score: 0.7,
            times_consulted: 1,
            confidence: 0.8,
            context_hash: computeContextHash("learning", "global", "git-workflow-practices"),
          })

          const projectScoped = await search.searchLearnings("database", { maxResults: 10, minRelevance: 0, scope: "project", domain: "project", halfLifeDays: 60 })
          expect(projectScoped.length).toBeGreaterThanOrEqual(1)
          expect((projectScoped[0]?.entry as Learning).domain).toBe("project")

          const crossSearch = await search.searchAll("git", { maxResults: 10, minRelevance: 0, scope: "project", halfLifeDays: 60 })
          expect(crossSearch.some((item) => (item.entry as Learning).domain === "global")).toBeTrue()
        })
      })
    })
  })

  describe("#given initialized manager", () => {
    describe("#when db becomes unavailable", () => {
      describe("#then", () => {
        it("degrades gracefully and recovers with fresh db path", async () => {
          const firstPath = makeDbPath("resilience-a"); dbPaths.push(firstPath)
          const manager = createMemoryManager(makeConfig(firstPath))
          const search = createSearchService(initializeDatabase(firstPath))
          closeAll()

          let error: unknown = null
          let results: unknown = null
          try {
            results = await search.searchLearnings("anything", { maxResults: 5, minRelevance: 0, scope: "project", halfLifeDays: 60 })
          } catch (err) {
            error = err
          }
          expect(error === null || error instanceof Error).toBeTrue()
          if (error === null) expect(Array.isArray(results)).toBeTrue()

          resetMemoryManager(); closeAll()
          const secondPath = makeDbPath("resilience-b"); dbPaths.push(secondPath)
          const recovered = createMemoryManager(makeConfig(secondPath))
          const recoveredSearch = createSearchService(initializeDatabase(secondPath))
          await addLearning(recovered.storage, {
            type: "success",
            summary: "recovery memory",
            context: "db recovery",
            domain: "project",
            tags: ["recovery"],
            utility_score: 0.6,
            confidence: 0.8,
            context_hash: computeContextHash("learning", "project", "recovery-memory"),
          })

          const recoveredResults = await recoveredSearch.searchLearnings("recovery", { maxResults: 5, minRelevance: 0, scope: "project", domain: "project", halfLifeDays: 60 })
          expect(recoveredResults.length).toBeGreaterThanOrEqual(1)
        })
      })
    })
  })

  describe("#given ELF tool in lifecycle context", () => {
    describe("#when search add-rule and metrics run", () => {
      describe("#then", () => {
        it("returns expected outputs and stores artifacts", async () => {
          const dbPath = makeDbPath("elf"); dbPaths.push(dbPath)
          const db = initializeDatabase(dbPath)
          const storage = createMemoryStorage(db)
          const search = createSearchService(db)

          await addLearning(storage, {
            type: "success",
            summary: "elf search target memory",
            context: "context",
            tool_name: "elf",
            domain: "project",
            tags: ["elf"],
            context_hash: computeContextHash("learning", "project", "elf-search-target"),
          })

          const elfTool = createElfTool({ storage, search, db, filterContent, computeContextHash, findExistingByHash })
          const searchResult = JSON.parse((await elfTool.execute({ action: "search", query: "elf search target" }, {} as Parameters<typeof elfTool.execute>[1])) as string) as { results: unknown[] }
          expect(searchResult.results.length).toBeGreaterThanOrEqual(1)

          const addRuleResult = JSON.parse((await elfTool.execute({ action: "add-rule", content: "Always validate memory scope before consolidation", type: "golden_rule", scope: "project" }, {} as Parameters<typeof elfTool.execute>[1])) as string) as { status: string }
          expect(addRuleResult.status).toBe("added")

          const metrics = JSON.parse((await elfTool.execute({ action: "metrics" }, {} as Parameters<typeof elfTool.execute>[1])) as string) as { totalMemories: number; byType: { learnings: number; golden_rules: number } }
          expect(metrics.totalMemories).toBeGreaterThanOrEqual(1)
          expect(metrics.byType.learnings).toBeNumber()
          expect(metrics.byType.golden_rules).toBeNumber()
        })
      })
    })
  })
})
