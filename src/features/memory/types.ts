/**
 * Core TypeScript types and interfaces for the memory system.
 * Type-only file — NO implementation code.
 */

export type LearningType = "success" | "failure" | "observation"

export type MemoryScope = "project" | "global"

export type LearningOutcome = "success" | "failure" | "partial"

/**
 * Core learning entry — captures knowledge from task execution
 */
export interface Learning {
  id: string
  type: LearningType
  summary: string
  context: string
  tool_name: string
  domain: string
  tags: string[]
  utility_score: number
  times_consulted: number
  context_hash: string
  confidence: number
  created_at: string
  updated_at: string
}

/**
 * Golden rule — validated pattern from multiple learning sources
 */
export interface GoldenRule {
  id: string
  rule: string
  domain: string
  confidence: number
  times_validated: number
  times_violated: number
  source_learning_ids: string[]
  created_at: string
  updated_at: string
}

/**
 * Heuristic — learning with golden rule metadata
 */
export interface Heuristic extends Learning {
  is_golden: boolean
}

/**
 * Search result combining entry with relevance score
 */
export interface MemorySearchResult {
  entry: Learning | GoldenRule
  score: number
  type: "learning" | "golden_rule"
}

/**
 * Memory system configuration
 */
export interface MemoryConfig {
  enabled: boolean
  scope: MemoryScope
  max_learnings: number
  max_golden_rules: number
  consolidation_threshold: number
  cleanup_threshold: number
  retention_days: number
  similarity_threshold: number
  max_golden_rules_injected: number
  max_learnings_injected: number
  max_injection_tokens: number
  ttl_learnings_days: number
  golden_rule_confidence_threshold: number
  golden_rule_validation_count: number
  project_db_path?: string
  global_db_path?: string
  dynamic_prompts_enabled: boolean
}

/**
 * Storage interface for learnings and golden rules
 */
export interface IMemoryStorage {
  addLearning(learning: Learning): Promise<void>
  getLearning(id: string): Promise<Learning | null>
  getLearningsByScope(scope: MemoryScope): Promise<Learning[]>
  incrementTimesConsulted(id: string): Promise<void>
  updateLearning(id: string, updates: Partial<Learning>): Promise<void>
  deleteLearning(id: string): Promise<void>
  addGoldenRule(rule: GoldenRule): Promise<void>
  getGoldenRules(domain?: string): Promise<GoldenRule[]>
  getGoldenRulesByScope(scope: MemoryScope): Promise<GoldenRule[]>
  deleteGoldenRule(id: string): Promise<void>
  getGoldenRule(id: string): Promise<GoldenRule | null>
  updateGoldenRule(id: string, updates: Partial<GoldenRule>): Promise<void>
  getStats(): Promise<{ learnings: number; goldenRules: number }>
}

/**
 * Search interface for querying memory
 */
export interface IMemorySearch {
  search(
    query: string,
    scope: MemoryScope,
    limit?: number
  ): Promise<MemorySearchResult[]>
  searchLearnings(query: string, options?: { maxResults?: number; scope?: MemoryScope }): Promise<MemorySearchResult[]>
}

/**
 * Embedding service (v2 stub)
 */
export interface IEmbeddingService {
  embed(text: string): Promise<number[]>
}

/**
 * Consolidation service for deriving golden rules
 */
export interface IConsolidationService {
  consolidate(scope: MemoryScope): Promise<unknown>
}

/**
 * Cleanup service for retention management
 */
export interface ICleanupService {
  cleanup(options?: { dryRun?: boolean }): Promise<unknown>
}
