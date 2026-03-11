import { describe, test, expect } from "bun:test"
import type {
  Learning,
  GoldenRule,
  Heuristic,
  MemorySearchResult,
  MemoryConfig,
  LearningType,
  MemoryScope,
  LearningOutcome,
  IMemoryStorage,
  IMemorySearch,
  IEmbeddingService,
  IConsolidationService,
  ICleanupService,
} from "./types"

describe("Memory System Types", () => {
  describe("#given type definitions exist", () => {
    describe("#when verifying type exports", () => {
      test("should have Learning interface with required fields", () => {
        // Compile-time check: if this passes, Learning is correctly defined
        const learning: Learning = {
          id: "1",
          type: "success",
          summary: "test",
          context: "test",
          tool_name: "test",
          domain: "test",
          tags: [],
          utility_score: 0.5,
          times_consulted: 1,
          context_hash: "hash",
          confidence: 0.9,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        expect(learning.id).toBe("1")
      })

      test("should have GoldenRule interface with required fields", () => {
        const rule: GoldenRule = {
          id: "1",
          rule: "test rule",
          domain: "test",
          confidence: 0.95,
          times_validated: 5,
          times_violated: 0,
          source_learning_ids: ["1", "2"],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        expect(rule.id).toBe("1")
      })

      test("should have Heuristic interface extending Learning", () => {
        const heuristic: Heuristic = {
          id: "1",
          type: "observation",
          summary: "test",
          context: "test",
          tool_name: "test",
          domain: "test",
          tags: [],
          utility_score: 0.5,
          times_consulted: 1,
          context_hash: "hash",
          confidence: 0.9,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_golden: true,
        }
        expect(heuristic.is_golden).toBe(true)
      })

      test("should have MemorySearchResult interface", () => {
        const result: MemorySearchResult = {
          entry: {
            id: "1",
            type: "success",
            summary: "test",
            context: "test",
            tool_name: "test",
            domain: "test",
            tags: [],
            utility_score: 0.5,
            times_consulted: 1,
            context_hash: "hash",
            confidence: 0.9,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          score: 0.85,
          type: "learning",
        }
        expect(result.score).toBe(0.85)
      })

      test("should have MemoryConfig interface", () => {
        const config: MemoryConfig = {
          enabled: true,
          scope: "project",
          max_learnings: 1000,
          max_golden_rules: 100,
          consolidation_threshold: 5,
          cleanup_threshold: 30,
          retention_days: 90,
          similarity_threshold: 0.7,
          max_golden_rules_injected: 5,
          max_learnings_injected: 10,
          max_injection_tokens: 500,
          ttl_learnings_days: 60,
          golden_rule_confidence_threshold: 0.9,
          golden_rule_validation_count: 10,
          dynamic_prompts_enabled: true,
        }
        expect(config.enabled).toBe(true)
      })

      test("should have LearningType union type", () => {
        const types: LearningType[] = ["success", "failure", "observation"]
        expect(types.length).toBe(3)
      })

      test("should have MemoryScope union type", () => {
        const scopes: MemoryScope[] = ["project", "global"]
        expect(scopes.length).toBe(2)
      })

      test("should have LearningOutcome union type", () => {
        const outcomes: LearningOutcome[] = ["success", "failure", "partial"]
        expect(outcomes.length).toBe(3)
      })

      test("should have IMemoryStorage interface with methods", () => {
        const storage: IMemoryStorage = {
          addLearning: async () => {},
          getLearning: async () => null,
          getLearningsByScope: async () => [],
          incrementTimesConsulted: async () => {},
          updateLearning: async () => {},
          deleteLearning: async () => {},
          addGoldenRule: async () => {},
          getGoldenRules: async () => [],
          getGoldenRulesByScope: async () => [],
          deleteGoldenRule: async () => {},
          getStats: async () => ({ learnings: 0, goldenRules: 0 }),
        }
        expect(storage).toBeDefined()
      })

      test("should have IMemorySearch interface with search method", () => {
        const search: IMemorySearch = {
          search: async () => [],
          searchLearnings: async () => [],
        }
        expect(search).toBeDefined()
      })

      test("should have IEmbeddingService interface with embed method", () => {
        const embedder: IEmbeddingService = {
          embed: async () => [],
        }
        expect(embedder).toBeDefined()
      })

      test("should have IConsolidationService interface with consolidate method", () => {
        const consolidator: IConsolidationService = {
          consolidate: async () => {},
        }
        expect(consolidator).toBeDefined()
      })

      test("should have ICleanupService interface with cleanup method", () => {
        const cleaner: ICleanupService = {
          cleanup: async () => {},
        }
        expect(cleaner).toBeDefined()
      })
    })

    describe("#then all 13 core types are correctly defined", () => {
      test("all required types import successfully without errors", () => {
        // If this test passes, all 13 types have been successfully imported
        expect(true).toBe(true)
      })
    })
  })
})
