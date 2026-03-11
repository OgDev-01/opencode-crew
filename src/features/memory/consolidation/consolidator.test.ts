import { describe, expect, it } from "bun:test"
import type { GoldenRule, Learning, MemoryScope, MemorySearchResult } from "../types"
import { createConsolidationService } from "./consolidator"

type ConsolidationLearning = Learning & { access_count?: number; promoted?: boolean }
type ConsolidationRule = GoldenRule & { utility_score?: number; scope: MemoryScope }

interface TestStorage {
  getLearningsByScope(scope: MemoryScope): Promise<ConsolidationLearning[]>
  updateLearning(id: string, updates: Partial<ConsolidationLearning>): Promise<void>
  deleteLearning(id: string): Promise<void>
  getGoldenRulesByScope(scope: MemoryScope): Promise<ConsolidationRule[]>
  addGoldenRule(rule: ConsolidationRule): Promise<void>
  deleteGoldenRule(id: string): Promise<void>
}

function createLearning(overrides: Partial<ConsolidationLearning>): ConsolidationLearning {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    type: overrides.type ?? "success",
    summary: overrides.summary ?? "Prefer deterministic fixtures in tests",
    context: overrides.context ?? "ctx",
    tool_name: overrides.tool_name ?? "Bash",
    domain: overrides.domain ?? "testing",
    tags: overrides.tags ?? ["test"],
    utility_score: overrides.utility_score ?? 0.95,
    times_consulted: overrides.times_consulted ?? 12,
    access_count: overrides.access_count,
    context_hash: overrides.context_hash ?? crypto.randomUUID(),
    confidence: overrides.confidence ?? 0.9,
    promoted: overrides.promoted,
    created_at: overrides.created_at ?? new Date(Date.now() - 8 * 86400000).toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
  }
}

describe("#given consolidation service", () => {
  describe("#when promoting high-confidence learnings", () => {
    describe("#then it synthesizes one golden rule from 3+ related learnings and marks sources promoted", () => {
      it("promotes only candidates passing all criteria", async () => {
        const projectLearnings: ConsolidationLearning[] = [
          createLearning({ id: "l1", summary: "Always assert deterministic outputs in CI" }),
          createLearning({ id: "l2", summary: "Always assert deterministic outputs for CI" }),
          createLearning({ id: "l3", summary: "Always assert deterministic outputs during CI" }),
          createLearning({ id: "l4", utility_score: 0.9 }),
          createLearning({ id: "l5", times_consulted: 9 }),
          createLearning({ id: "l6", created_at: new Date(Date.now() - 6 * 86400000).toISOString() }),
        ]
        const rules: ConsolidationRule[] = []

        const storage: TestStorage = {
          async getLearningsByScope() {
            return projectLearnings
          },
          async updateLearning(id, updates) {
            const target = projectLearnings.find((item) => item.id === id)
            if (target) Object.assign(target, updates)
          },
          async deleteLearning(id) {
            const idx = projectLearnings.findIndex((item) => item.id === id)
            if (idx >= 0) projectLearnings.splice(idx, 1)
          },
          async getGoldenRulesByScope() {
            return rules
          },
          async addGoldenRule(rule) {
            rules.push(rule)
          },
          async deleteGoldenRule(id) {
            const idx = rules.findIndex((item) => item.id === id)
            if (idx >= 0) rules.splice(idx, 1)
          },
        }

        const search = {
          async searchLearnings(): Promise<MemorySearchResult[]> {
            return projectLearnings.slice(0, 3).map((learning) => ({
              entry: learning,
              score: 0.9,
              type: "learning" as const,
            }))
          },
        }

        const result = await createConsolidationService(storage, search).consolidate("project")

        expect(result.promoted).toBe(3)
        expect(result.synthesized).toBe(1)
        expect(rules).toHaveLength(1)
        expect(rules[0]?.rule.startsWith("Always ")).toBeTrue()
        expect(projectLearnings.find((item) => item.id === "l1")?.promoted).toBeTrue()
        expect(projectLearnings.find((item) => item.id === "l2")?.promoted).toBeTrue()
        expect(projectLearnings.find((item) => item.id === "l3")?.promoted).toBeTrue()
        expect(projectLearnings.find((item) => item.id === "l4")?.promoted).toBeUndefined()
        expect(projectLearnings.find((item) => item.id === "l5")?.promoted).toBeUndefined()
        expect(projectLearnings.find((item) => item.id === "l6")?.promoted).toBeUndefined()
      })
    })
  })

  describe("#when scope limits are reached", () => {
    describe("#then it evicts lowest-score entries before/after promotion", () => {
      it("enforces golden-rule cap 5 and learning caps 50 facts, 200 observations", async () => {
        const facts = Array.from({ length: 51 }, (_, index) =>
          createLearning({
            id: `f-${index}`,
            type: index % 2 === 0 ? "success" : "failure",
            utility_score: index === 0 ? 0.01 : 0.6,
          })
        )
        const observations = Array.from({ length: 201 }, (_, index) =>
          createLearning({
            id: `o-${index}`,
            type: "observation",
            utility_score: index === 0 ? 0.02 : 0.5,
          })
        )
        const candidates = [
          createLearning({ id: "c1", summary: "Always keep logs deterministic in CI" }),
          createLearning({ id: "c2", summary: "Always keep CI logs deterministic" }),
          createLearning({ id: "c3", summary: "Always keep deterministic logs for CI" }),
        ]
        const projectLearnings: ConsolidationLearning[] = [...facts, ...observations, ...candidates]
        const rules: ConsolidationRule[] = Array.from({ length: 5 }, (_, index) => ({
          id: `r-${index}`,
          rule: `Rule ${index}`,
          domain: "testing",
          scope: "project",
          confidence: 0.8,
          utility_score: index === 0 ? 0.1 : 0.9,
          times_validated: 1,
          times_violated: 0,
          source_learning_ids: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))

        const storage: TestStorage = {
          async getLearningsByScope() {
            return projectLearnings
          },
          async updateLearning(id, updates) {
            const target = projectLearnings.find((item) => item.id === id)
            if (target) Object.assign(target, updates)
          },
          async deleteLearning(id) {
            const idx = projectLearnings.findIndex((item) => item.id === id)
            if (idx >= 0) projectLearnings.splice(idx, 1)
          },
          async getGoldenRulesByScope() {
            return rules
          },
          async addGoldenRule(rule) {
            rules.push(rule)
          },
          async deleteGoldenRule(id) {
            const idx = rules.findIndex((item) => item.id === id)
            if (idx >= 0) rules.splice(idx, 1)
          },
        }

        const search = {
          async searchLearnings(): Promise<MemorySearchResult[]> {
            return candidates.map((entry) => ({ entry, score: 0.8, type: "learning" as const }))
          },
        }

        const result = await createConsolidationService(storage, search).consolidate("project")

        expect(result.evicted).toBe(6)
        expect(result.synthesized).toBe(1)
        expect(rules).toHaveLength(5)
        expect(rules.find((rule) => rule.id === "r-0")).toBeUndefined()
        expect(projectLearnings.some((item) => item.id === "f-0")).toBeFalse()
        expect(projectLearnings.some((item) => item.id === "o-0")).toBeFalse()
        expect(projectLearnings.filter((item) => item.type !== "observation").length).toBeLessThanOrEqual(50)
        expect(projectLearnings.filter((item) => item.type === "observation").length).toBeLessThanOrEqual(200)
      })
    })
  })

  describe("#when consolidating all scopes", () => {
    describe("#then it processes project and global scopes and merges counts", () => {
      it("returns aggregate consolidation result", async () => {
        const service = createConsolidationService(
          {
            async getLearningsByScope(scope) {
              return [createLearning({ id: `${scope}-1` }), createLearning({ id: `${scope}-2` }), createLearning({ id: `${scope}-3` })]
            },
            async updateLearning() {},
            async deleteLearning() {},
            async getGoldenRulesByScope() {
              return []
            },
            async addGoldenRule() {},
            async deleteGoldenRule() {},
          },
          {
            async searchLearnings(): Promise<MemorySearchResult[]> {
              return []
            },
          }
        )

        const result = await service.consolidateAll()
        expect(result.promoted).toBe(0)
        expect(result.synthesized).toBe(0)
        expect(result.evicted).toBe(0)
      })
    })
  })

  describe("#when custom consolidation thresholds are lower", () => {
    describe("#then it promotes learnings using configured confidence and validation counts", () => {
      it("promotes candidates that would not pass the default thresholds", async () => {
        const projectLearnings: ConsolidationLearning[] = [
          createLearning({ id: "c1", summary: "Prefer short feedback loops", utility_score: 0.8, times_consulted: 3 }),
          createLearning({ id: "c2", summary: "Prefer short dev feedback loops", utility_score: 0.8, times_consulted: 3 }),
          createLearning({ id: "c3", summary: "Prefer fast feedback loops during development", utility_score: 0.8, times_consulted: 3 }),
        ]
        const rules: ConsolidationRule[] = []

        const storage: TestStorage = {
          async getLearningsByScope() {
            return projectLearnings
          },
          async updateLearning(id, updates) {
            const target = projectLearnings.find((item) => item.id === id)
            if (target) Object.assign(target, updates)
          },
          async deleteLearning() {},
          async getGoldenRulesByScope() {
            return rules
          },
          async addGoldenRule(rule) {
            rules.push(rule)
          },
          async deleteGoldenRule() {},
        }

        const search = {
          async searchLearnings(): Promise<MemorySearchResult[]> {
            return projectLearnings.map((entry) => ({ entry, score: 0.8, type: "learning" as const }))
          },
        }

        const result = await createConsolidationService(storage, search, {
          minConfidence: 0.75,
          minValidationCount: 3,
        }).consolidate("project")

        expect(result.synthesized).toBe(1)
        expect(result.promoted).toBe(3)
      })
    })
  })
})
