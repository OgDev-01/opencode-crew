/**
 * FTS5 search utilities for memory system.
 * Pure utility functions for query building, result scoring, and deduplication.
 */

export interface FTS5RawResult {
  rank: number
  utility_score: number
  last_accessed_at: string
  content_hash?: string
  [key: string]: unknown
}

export interface ScoredResult extends FTS5RawResult {
  score: number
}

export interface ScoreOptions {
  halfLifeDays?: number
}

/**
 * Stop words to filter out during query building.
 */
const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "in",
  "of",
  "to",
  "and",
  "or",
  "for",
  "with",
  "at",
  "by",
  "from",
  "it",
  "that",
  "this",
  "was",
  "are",
  "be",
  "as",
  "on",
])

/**
 * Extract quoted phrases from query string.
 * Returns array of [phrase, withQuotes].
 */
function extractQuotedPhrases(query: string): string[] {
  const phrases: string[] = []
  const regex = /"([^"]*)"/g
  let match

  // eslint-disable-next-line no-cond-assign
  while ((match = regex.exec(query)) !== null) {
    const sanitized = match[1].replace(/[?*+\-^(){}[\]~:\\/.,;!@#$%&='"<>|`]/g, "").trim()
    if (sanitized.length > 0) {
      phrases.push(`"${sanitized}"`)
    }
  }

  return phrases
}

/**
 * Remove quoted phrases from query, leaving surrounding text.
 */
function removeQuotedPhrases(query: string): string {
  return query.replace(/"[^"]*"/g, " ").trim()
}

/**
 * Build FTS5-compatible query string from natural language query.
 * Converts multi-word queries to "word1 OR word2 OR word3" format.
 * Preserves quoted phrases for exact matching.
 * Filters stop words.
 */
export function buildFTS5Query(query: string): string {
  // Extract quoted phrases first
  const quotedPhrases = extractQuotedPhrases(query)

  // Remove quoted phrases, tokenize remaining words
  const remaining = removeQuotedPhrases(query)
  const words = remaining
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[?*+\-^(){}[\]~:\\/.,;!@#$%&='"<>|`]/g, ""))
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word))

  // Combine phrases + filtered words
  const allTerms = [...quotedPhrases, ...words]

  // Return empty if nothing left
  if (allTerms.length === 0) {
    return ""
  }

  // Join with OR
  return allTerms.join(" OR ")
}

/**
 * Score FTS5 results using bm25 rank + recency + utility.
 * Returns results sorted by final score descending.
 */
export function scoreFTS5Results(
  results: FTS5RawResult[],
  query: string,
  options?: ScoreOptions
): ScoredResult[] {
  if (results.length === 0) {
    return []
  }

  const halfLifeDays = options?.halfLifeDays ?? 60
  const now = Date.now()

  // Compute raw scores for each result
  const scored: ScoredResult[] = results.map((result) => {
    // Base score: flip negative bm25 rank to positive (higher = better)
    const baseScore = -result.rank

    // Recency bonus: exp(-0.693 * daysSince / halfLife)
    // At halfLife days, bonus = 0.5
    const daysSince =
      (now - new Date(result.last_accessed_at).getTime()) / 86400000
    const recencyBonus = Math.exp(-0.693 * daysSince / halfLifeDays)

    // Utility multiplier: (1 + utility_score)
    // utility_score is 0.0-1.0, so multiplier is 1.0-2.0
    const utilityMultiplier = 1 + result.utility_score

    // Raw score combines all factors
    const rawScore = baseScore * recencyBonus * utilityMultiplier

    return {
      ...result,
      score: rawScore,
    }
  })

  // Normalize scores to 0.0-1.0 range
  const maxScore = Math.max(...scored.map((r) => r.score))
  if (maxScore > 0) {
    scored.forEach((result) => {
      result.score = result.score / maxScore
    })
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)

  return scored
}

/**
 * Remove duplicate results by exact content_hash match.
 * Keeps the higher-scored result when duplicates found.
 * v1: Only exact hash dedup (no embeddings).
 * similarityThreshold parameter ignored in v1.
 */
export function deduplicateByContent(
  results: ScoredResult[],
  similarityThreshold: number
): ScoredResult[] {
  if (results.length === 0) {
    return []
  }

  const seen = new Map<string, ScoredResult>()

  for (const result of results) {
    const hash = result.content_hash

    // Skip results without hash (no dedup possible)
    if (!hash) {
      // Find if we already have this without a hash
      // In v1, we only deduplicate by exact hash match
      // So items without hash are never deduplicated
      continue
    }

    // Keep the higher-scored version
    const existing = seen.get(hash)
    if (!existing || result.score > existing.score) {
      seen.set(hash, result)
    }
  }

  // Collect results: those with hash (deduplicated) + those without hash (undedup)
  const hashResults = Array.from(seen.values())
  const noHashResults = results.filter((r) => !r.content_hash)

  // Combine and return in original order (approximately)
  // Actually, return in score order for consistency
  const combined = [...hashResults, ...noHashResults]
  combined.sort((a, b) => b.score - a.score)

  return combined
}
