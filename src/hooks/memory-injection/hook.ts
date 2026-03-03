import type { MemorySearchResult, GoldenRule, Learning } from "@/features/memory/types"
import type { ContextSourceType, ContextPriority } from "@/features/context-injector"
import { estimateTokenCount } from "@/features/memory/token-counter"
import { log } from "@/shared"

const DEFAULT_MAX_TOKENS = 500
const DEFAULT_GOLDEN_RULE_MAX_TOKENS = 200
const THROTTLE_THRESHOLD = 0.70
const SKIP_THRESHOLD = 0.85

export interface MemorySearchService {
  searchAll(
    query: string,
    options: { maxResults: number; minRelevance: number; halfLifeDays: number }
  ): Promise<MemorySearchResult[]>
  searchGoldenRules(
    query: string,
    options: { maxResults: number }
  ): Promise<MemorySearchResult[]>
}

interface CollectorLike {
  register(
    sessionID: string,
    opts: { id: string; source: ContextSourceType; content: string; priority?: ContextPriority; metadata?: Record<string, unknown> }
  ): void
}

interface UsageResult {
  usedTokens: number
  remainingTokens: number
  usagePercentage: number
}

export interface MemoryInjectionDeps {
  search: MemorySearchService
  collector: CollectorLike
  getUsage?: () => UsageResult | null
  getMainSessionID?: () => string | undefined
  config?: { maxTokens?: number; goldenRuleMaxTokens?: number }
}

type TransformInput = Record<string, unknown>
type MessageInfo = { role?: string; sessionID?: string; [key: string]: unknown }
type MessageWithParts = { info: MessageInfo; parts?: unknown[] }
type TransformOutput = { messages: MessageWithParts[] }

export function createMemoryInjectionHook(deps: MemoryInjectionDeps) {
  const maxTokens = deps.config?.maxTokens ?? DEFAULT_MAX_TOKENS
  const goldenRuleMaxTokens = deps.config?.goldenRuleMaxTokens ?? DEFAULT_GOLDEN_RULE_MAX_TOKENS

  return {
    "experimental.chat.messages.transform": async (
      input: TransformInput,
      output: TransformOutput,
    ): Promise<void> => {
      try {
        const metadata = (input as Record<string, unknown>).metadata as Record<string, unknown> | undefined
        if (metadata?.isSubagent === true) return

        const usage = deps.getUsage?.() ?? null
        if (usage && usage.usagePercentage > SKIP_THRESHOLD) return

        const isThrottled = usage !== null && usage.usagePercentage > THROTTLE_THRESHOLD
        const tokenBudget = isThrottled ? goldenRuleMaxTokens : maxTokens

        const messages = output.messages ?? []
        const sessionID = resolveSessionID(messages, deps.getMainSessionID)
        if (!sessionID) return

        const lastUserMessage = extractLastUserMessage(messages)
        const query = lastUserMessage ?? ""

        const [goldenResults, allResults] = await Promise.all([
          deps.search.searchGoldenRules("", { maxResults: 5 }),
          isThrottled
            ? Promise.resolve([])
            : deps.search.searchAll(query, { maxResults: 5, minRelevance: 0.3, halfLifeDays: 60 }),
        ])

        const goldenRules = goldenResults
          .filter((r) => r.type === "golden_rule")
          .map((r) => (r.entry as GoldenRule).rule)

        const learnings = allResults
          .filter((r) => r.type === "learning")
          .map((r) => (r.entry as Learning).summary)

        if (goldenRules.length === 0 && learnings.length === 0) return

        const injectionBlock = buildInjectionBlock(goldenRules, learnings, tokenBudget)
        if (!injectionBlock) return

        deps.collector.register(sessionID, {
          id: "memory-injection",
          source: "memory",
          content: injectionBlock,
          priority: "normal",
        })

        log("[memory-injection] injected memory context", {
          goldenRules: goldenRules.length,
          learnings: learnings.length,
          tokenBudget,
        })
      } catch (error) {
        log("[memory-injection] hook error (swallowed)", {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }
}

function resolveSessionID(
  messages: MessageWithParts[],
  getMainSessionID?: () => string | undefined,
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const sid = messages[i].info?.sessionID
    if (sid) return sid
  }
  return getMainSessionID?.()
}

function extractLastUserMessage(messages: MessageWithParts[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info?.role === "user") {
      const parts = messages[i].parts
      if (Array.isArray(parts)) {
        const textPart = parts.find((p: unknown) => (p as Record<string, unknown>).type === "text")
        if (textPart) return (textPart as Record<string, string>).text ?? null
      }
      return null
    }
  }
  return null
}

function buildInjectionBlock(
  goldenRules: string[],
  learnings: string[],
  tokenBudget: number,
): string | null {
  const sections: string[] = ["## Agent Memory"]

  if (goldenRules.length > 0) {
    sections.push("### Golden Rules")
    for (const rule of goldenRules) {
      sections.push(`- ${rule}`)
    }
  }

  if (learnings.length > 0) {
    sections.push("### Relevant Learnings")
    for (const learning of learnings) {
      sections.push(`- ${learning}`)
    }
  }

  if (sections.length <= 1) return null

  let block = sections.join("\n")
  let tokens = estimateTokenCount(block)

  while (tokens > tokenBudget && learnings.length > 0) {
    learnings.pop()
    const rebuilt = rebuildBlock(goldenRules, learnings)
    block = rebuilt
    tokens = estimateTokenCount(block)
  }

  if (tokens > tokenBudget && goldenRules.length > 0) {
    while (tokens > tokenBudget && goldenRules.length > 0) {
      goldenRules.pop()
      block = rebuildBlock(goldenRules, learnings)
      tokens = estimateTokenCount(block)
    }
  }

  if (tokens > tokenBudget || block === "## Agent Memory") return null

  return block
}

function rebuildBlock(goldenRules: string[], learnings: string[]): string {
  const sections: string[] = ["## Agent Memory"]

  if (goldenRules.length > 0) {
    sections.push("### Golden Rules")
    for (const rule of goldenRules) {
      sections.push(`- ${rule}`)
    }
  }

  if (learnings.length > 0) {
    sections.push("### Relevant Learnings")
    for (const learning of learnings) {
      sections.push(`- ${learning}`)
    }
  }

  return sections.join("\n")
}
