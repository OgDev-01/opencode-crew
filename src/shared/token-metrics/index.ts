import { log } from "../logger"
import type { TokenMetricsConfig } from "@/config/schema/token-metrics"

const tokenBreakdown = new Map<string, number>()

export const CHARS_PER_TOKEN = 4

export function estimateTokensForContent(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function fitWithinTokenBudget<T extends { content: string; priority: number }>(
  items: T[],
  maxTokens: number
): T[] {
  const sorted = [...items].sort((a, b) => b.priority - a.priority)

  const selected: T[] = []
  let totalTokens = 0

  for (const item of sorted) {
    const itemTokens = estimateTokensForContent(item.content)
    if (totalTokens + itemTokens <= maxTokens) {
      selected.push(item)
      totalTokens += itemTokens
    }
  }

  return selected
}

export function measurePromptTokens(
  messages: Array<{ role: string; content: string }>
): number {
  let totalTokens = 0

  for (const message of messages) {
    const roleTokens = estimateTokensForContent(message.role)
    const contentTokens = estimateTokensForContent(message.content)
    const overheadTokens = 4

    totalTokens += roleTokens + contentTokens + overheadTokens
  }

  return totalTokens
}

export function logTokenUsage(
  source: string,
  content: string,
  config?: TokenMetricsConfig
): void {
  if (!config?.enabled) {
    return
  }

  const estimatedTokens = estimateTokensForContent(content)
  const previousTotal = tokenBreakdown.get(source) ?? 0
  const updatedTotal = previousTotal + estimatedTokens

  tokenBreakdown.set(source, updatedTotal)
  log("[token-metrics] token usage", {
    source,
    estimated_tokens: estimatedTokens,
  })
}

export function getTokenBreakdown(): Map<string, number> {
  return new Map(tokenBreakdown)
}

export function resetMetrics(): void {
  tokenBreakdown.clear()
}
