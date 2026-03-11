import { applyTemporalDecay } from "../scoring/utility-scorer"
import { buildFTS5Query } from "../search/fts5-utils"
import type { GoldenRule, Learning, MemoryScope, MemorySearchResult } from "../types"

type ConsolidationLearning = Learning & { access_count?: number; promoted?: boolean; scope?: MemoryScope }
type ConsolidationRule = GoldenRule & { utility_score?: number; scope?: MemoryScope }

export interface IMemoryStorage {
  getLearningsByScope(scope: MemoryScope): Promise<ConsolidationLearning[]>
  updateLearning(id: string, updates: Partial<ConsolidationLearning>): Promise<void>
  deleteLearning(id: string): Promise<void>
  getGoldenRulesByScope(scope: MemoryScope): Promise<ConsolidationRule[]>
  addGoldenRule(rule: ConsolidationRule): Promise<void>
  deleteGoldenRule(id: string): Promise<void>
}

export interface ISearchService {
  searchLearnings(
    query: string,
    opts?: { maxResults?: number; scope?: MemoryScope }
  ): Promise<MemorySearchResult[]>
}

export interface ConsolidationResult {
  promoted: number
  synthesized: number
  evicted: number
}

export interface IConsolidationService {
  consolidate(scope: MemoryScope): Promise<ConsolidationResult>
  consolidateAll(): Promise<ConsolidationResult>
}

interface ConsolidationConfig {
  minConfidence?: number
  minValidationCount?: number
}

const DAY_MS = 86400000

function zeroResult(): ConsolidationResult {
  return { promoted: 0, synthesized: 0, evicted: 0 }
}

function normalizeRule(summary: string): string {
  const cleaned = summary.trim().replace(/[.?!]+$/, "")
  const body = cleaned.length === 0 ? "follow proven execution patterns" : cleaned.toLowerCase()
  return `Always ${body}`
}

function isCandidate(
  learning: ConsolidationLearning,
  now: number,
  config: Required<ConsolidationConfig>
): boolean {
  const accessCount = learning.access_count ?? learning.times_consulted
  const ageMs = now - new Date(learning.created_at).getTime()
  return learning.utility_score >= config.minConfidence && accessCount >= config.minValidationCount && ageMs > 7 * DAY_MS && !learning.promoted
}

function learningFromResult(result: MemorySearchResult): ConsolidationLearning | null {
  const entry = result.entry as Partial<ConsolidationLearning>
  return typeof entry.id === "string" && typeof entry.summary === "string" ? (entry as ConsolidationLearning) : null
}

function lowestByScore<T extends { utility_score?: number; confidence?: number; created_at?: string }>(items: T[]): T | null {
  if (items.length === 0) return null
  const now = Date.now()
  return items.reduce((lowest, current) => {
    const currentBase = current.utility_score ?? current.confidence ?? 0
    const lowestBase = lowest.utility_score ?? lowest.confidence ?? 0
    const currentAge = current.created_at ? (now - new Date(current.created_at).getTime()) / DAY_MS : 0
    const lowestAge = lowest.created_at ? (now - new Date(lowest.created_at).getTime()) / DAY_MS : 0
    return applyTemporalDecay(currentBase, currentAge) < applyTemporalDecay(lowestBase, lowestAge) ? current : lowest
  })
}

export function createConsolidationService(
  storage: IMemoryStorage,
  search: ISearchService,
  config?: ConsolidationConfig
): IConsolidationService {
  const thresholds: Required<ConsolidationConfig> = {
    minConfidence: config?.minConfidence ?? 0.9,
    minValidationCount: config?.minValidationCount ?? 10,
  }

  const consolidate = async (scope: MemoryScope): Promise<ConsolidationResult> => {
    const result = zeroResult()
    const allLearnings = await storage.getLearningsByScope(scope)
    const candidates = allLearnings.filter((learning) => isCandidate(learning, Date.now(), thresholds))
    const consumed = new Set<string>()

    for (const candidate of candidates) {
      if (consumed.has(candidate.id)) continue
      const query = buildFTS5Query(candidate.summary) || candidate.summary
      const related = await search.searchLearnings(query, { maxResults: 10, scope })
      const cluster = related
        .map(learningFromResult)
        .filter((item): item is ConsolidationLearning => item !== null)
        .filter((item) => candidates.some((candidateLearning) => candidateLearning.id === item.id))
        .filter((item) => !consumed.has(item.id))

      if (cluster.length < 3) continue
      const ruleText = normalizeRule(cluster[0]?.summary ?? candidate.summary)
      const existingRules = await storage.getGoldenRulesByScope(scope)
      if (existingRules.length >= 5) {
        const evicted = lowestByScore(existingRules)
        if (evicted) {
          await storage.deleteGoldenRule(evicted.id)
          result.evicted += 1
        }
      }

      const sourceIds = Array.from(new Set(cluster.map((item) => item.id)))
      await storage.addGoldenRule({
        id: crypto.randomUUID(),
        rule: ruleText,
        domain: candidate.domain,
        scope,
        confidence: Math.max(...cluster.map((item) => item.utility_score)),
        utility_score: Math.max(...cluster.map((item) => item.utility_score)),
        times_validated: sourceIds.length,
        times_violated: 0,
        source_learning_ids: sourceIds,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      for (const learning of cluster) {
        consumed.add(learning.id)
        await storage.updateLearning(learning.id, { promoted: true })
      }
      result.promoted += sourceIds.length
      result.synthesized += 1
    }

    const post = await storage.getLearningsByScope(scope)
    const facts = post.filter((item) => item.type !== "observation")
    const observations = post.filter((item) => item.type === "observation")

    while (facts.length > 50) {
      const evicted = lowestByScore(facts)
      if (!evicted) break
      await storage.deleteLearning(evicted.id)
      facts.splice(facts.findIndex((item) => item.id === evicted.id), 1)
      result.evicted += 1
    }

    while (observations.length > 200) {
      const evicted = lowestByScore(observations)
      if (!evicted) break
      await storage.deleteLearning(evicted.id)
      observations.splice(observations.findIndex((item) => item.id === evicted.id), 1)
      result.evicted += 1
    }

    return result
  }

  const consolidateAll = async (): Promise<ConsolidationResult> => {
    const project = await consolidate("project")
    const global = await consolidate("global")
    return {
      promoted: project.promoted + global.promoted,
      synthesized: project.synthesized + global.synthesized,
      evicted: project.evicted + global.evicted,
    }
  }

  return { consolidate, consolidateAll }
}
