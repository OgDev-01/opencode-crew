import { Database } from "bun:sqlite"
import { initializeDatabase } from "../db/client"
import type { GoldenRule, IMemorySearch, Learning, MemoryScope, MemorySearchResult } from "../types"
import { buildFTS5Query, deduplicateByContent, scoreFTS5Results } from "./fts5-utils"

export interface SearchOptions {
  maxResults: number
  minRelevance: number
  domain?: string
  scope: MemoryScope
  halfLifeDays: number
}

const DEFAULT_OPTIONS: SearchOptions = {
  maxResults: 15,
  minRelevance: 0.3,
  scope: "project",
  halfLifeDays: 60,
}

type LearningRow = {
  id: string
  type: Learning["type"]
  summary: string
  context: string
  tool_name: string
  domain: string
  tags: string | null
  utility_score: number
  times_consulted: number
  context_hash: string
  confidence: number
  created_at: string
  updated_at: string
  rank: number
  last_accessed_at: string
}

type GoldenRuleRow = {
  id: string
  rule: string
  domain: string
  confidence: number
  times_validated: number
  source_learning_ids: string | null
  created_at: string
  updated_at: string
  rank: number
  last_accessed_at: string
  utility_score: number
}

function mergeOptions(overrides?: Partial<SearchOptions>): SearchOptions {
  return { ...DEFAULT_OPTIONS, ...overrides }
}

function toLearningResult(row: LearningRow, score: number): MemorySearchResult {
  const entry: Learning = {
    id: row.id,
    type: row.type,
    summary: row.summary,
    context: row.context,
    tool_name: row.tool_name,
    domain: row.domain,
    tags: row.tags ? row.tags.split(",").filter(Boolean) : [],
    utility_score: row.utility_score,
    times_consulted: row.times_consulted,
    context_hash: row.context_hash,
    confidence: row.confidence,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }

  const result = {
    entry,
    type: "learning",
    score,
    id: row.id,
    content: row.summary,
    domain: row.domain,
    created_at: row.created_at,
    last_accessed_at: row.updated_at,
  }
  return result as unknown as MemorySearchResult
}

function toGoldenRuleResult(row: GoldenRuleRow, score: number): MemorySearchResult {
  const entry: GoldenRule = {
    id: row.id,
    rule: row.rule,
    domain: row.domain,
    confidence: row.confidence,
    times_validated: row.times_validated,
    times_violated: 0,
    source_learning_ids: row.source_learning_ids
      ? (JSON.parse(row.source_learning_ids) as string[])
      : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }

  const result = {
    entry,
    type: "golden_rule",
    score,
    id: row.id,
    content: row.rule,
    domain: row.domain,
    created_at: row.created_at,
    last_accessed_at: row.updated_at,
  }
  return result as unknown as MemorySearchResult
}

interface ExtendedMemorySearch extends IMemorySearch {
  searchLearnings(query: string, options?: Partial<SearchOptions>): Promise<MemorySearchResult[]>
  searchGoldenRules(query: string, options?: Partial<SearchOptions>): Promise<MemorySearchResult[]>
  searchAll(query: string, options?: Partial<SearchOptions>): Promise<MemorySearchResult[]>
}

export function createSearchService(db: Database): ExtendedMemorySearch {
  const activeDb = db ?? initializeDatabase(":memory:")

  function safeFtsQuery<T>(fn: () => T[]): T[] {
    try {
      return fn()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes("fts5")) return []
      throw error
    }
  }

  const searchLearnings = async (
    query: string,
    options?: Partial<SearchOptions>
  ): Promise<MemorySearchResult[]> => {
    const config = mergeOptions(options)
    const ftsQuery = buildFTS5Query(query)
    if (!ftsQuery) return []
    const sql = config.domain
      ? "SELECT l.*, bm25(learnings_fts) as rank, l.updated_at as last_accessed_at FROM learnings_fts JOIN learnings l ON learnings_fts.rowid = l.rowid WHERE learnings_fts MATCH ? AND l.domain = ? ORDER BY rank"
      : "SELECT l.*, bm25(learnings_fts) as rank, l.updated_at as last_accessed_at FROM learnings_fts JOIN learnings l ON learnings_fts.rowid = l.rowid WHERE learnings_fts MATCH ? ORDER BY rank"
    const rows = safeFtsQuery(() =>
      (config.domain
        ? activeDb.prepare(sql).all(ftsQuery, config.domain)
        : activeDb.prepare(sql).all(ftsQuery)) as LearningRow[]
    )
    const scored = scoreFTS5Results(rows, query, { halfLifeDays: config.halfLifeDays })
    return deduplicateByContent(scored, 1)
      .filter((item) => item.score >= config.minRelevance)
      .slice(0, config.maxResults)
      .map((item) => toLearningResult(item as unknown as LearningRow, item.score))
  }

  const searchGoldenRules = async (
    query: string,
    options?: Partial<SearchOptions>
  ): Promise<MemorySearchResult[]> => {
    const config = mergeOptions(options)
    const ftsQuery = buildFTS5Query(query)

    if (!ftsQuery) {
      const fallbackSql = config.domain
        ? "SELECT g.*, 0 as rank, g.updated_at as last_accessed_at, g.confidence as utility_score FROM golden_rules g WHERE g.domain = ? ORDER BY g.confidence DESC"
        : "SELECT g.*, 0 as rank, g.updated_at as last_accessed_at, g.confidence as utility_score FROM golden_rules g ORDER BY g.confidence DESC"
      const fallbackRows = (config.domain
        ? activeDb.prepare(fallbackSql).all(config.domain)
        : activeDb.prepare(fallbackSql).all()) as GoldenRuleRow[]
      return fallbackRows
        .slice(0, config.maxResults)
        .map((row) => toGoldenRuleResult(row, row.confidence ?? 0.9))
    }

    const sql = config.domain
      ? "SELECT g.*, bm25(golden_rules_fts) as rank, g.updated_at as last_accessed_at, g.confidence as utility_score FROM golden_rules_fts JOIN golden_rules g ON golden_rules_fts.rowid = g.rowid WHERE golden_rules_fts MATCH ? AND g.domain = ? ORDER BY rank"
      : "SELECT g.*, bm25(golden_rules_fts) as rank, g.updated_at as last_accessed_at, g.confidence as utility_score FROM golden_rules_fts JOIN golden_rules g ON golden_rules_fts.rowid = g.rowid WHERE golden_rules_fts MATCH ? ORDER BY rank"
    const rows = safeFtsQuery(() =>
      (config.domain
        ? activeDb.prepare(sql).all(ftsQuery, config.domain)
        : activeDb.prepare(sql).all(ftsQuery)) as GoldenRuleRow[]
    )
    const scored = scoreFTS5Results(rows, query, { halfLifeDays: config.halfLifeDays })
    return deduplicateByContent(scored, 1)
      .filter((item) => item.score >= config.minRelevance)
      .slice(0, config.maxResults)
      .map((item) => toGoldenRuleResult(item as unknown as GoldenRuleRow, item.score))
  }

  const searchAll = async (
    query: string,
    options?: Partial<SearchOptions>
  ): Promise<MemorySearchResult[]> => {
    const config = mergeOptions(options)
    const [learningResults, ruleResults] = await Promise.all([
      searchLearnings(query, { ...config, minRelevance: 0, maxResults: config.maxResults }),
      searchGoldenRules(query, { ...config, minRelevance: 0, maxResults: config.maxResults }),
    ])
    return [...learningResults, ...ruleResults]
      .filter((item) => item.score >= config.minRelevance)
      .sort((a, b) => b.score - a.score)
      .slice(0, config.maxResults)
  }

  const search: ExtendedMemorySearch["search"] = async (query, scopeOrOptions, limit) => {
    if (typeof scopeOrOptions === "string") {
      return searchAll(query, { scope: scopeOrOptions, maxResults: limit ?? DEFAULT_OPTIONS.maxResults })
    }
    return searchAll(query, scopeOrOptions)
  }

  return {
    search,
    searchLearnings,
    searchGoldenRules,
    searchAll,
  }
}
