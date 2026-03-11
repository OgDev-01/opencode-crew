const DEFAULT_ACTUAL_LIMIT = 200_000

export interface TokenInfo {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}

interface CachedTokenState {
  providerID: string
  tokens: TokenInfo
}

export interface SessionUsageSnapshot {
  usedTokens: number
  remainingTokens: number
  usagePercentage: number
}

const tokenCache = new Map<string, CachedTokenState>()

function isAnthropicProvider(providerID: string): boolean {
  return providerID === "anthropic" || providerID === "google-vertex-anthropic"
}

function getActualLimit(): number {
  return process.env.ANTHROPIC_1M_CONTEXT === "true" ||
    process.env.VERTEX_ANTHROPIC_1M_CONTEXT === "true"
    ? 1_000_000
    : DEFAULT_ACTUAL_LIMIT
}

export function cacheSessionTokenUsage(sessionID: string, providerID: string, tokens: TokenInfo): void {
  tokenCache.set(sessionID, { providerID, tokens })
}

export function clearSessionTokenUsage(sessionID: string): void {
  tokenCache.delete(sessionID)
}

export function getSessionContextUsage(sessionID: string): SessionUsageSnapshot | null {
  const cached = tokenCache.get(sessionID)
  if (!cached) return null
  if (!isAnthropicProvider(cached.providerID)) return null

  const usedTokens = (cached.tokens.input ?? 0) + (cached.tokens.cache?.read ?? 0)
  const limit = getActualLimit()
  const usagePercentage = limit > 0 ? usedTokens / limit : 0

  return {
    usedTokens,
    remainingTokens: Math.max(0, limit - usedTokens),
    usagePercentage,
  }
}

export function clearAllSessionTokenUsage(): void {
  tokenCache.clear()
}
