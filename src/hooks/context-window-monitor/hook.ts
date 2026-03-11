import type { PluginInput } from "@opencode-ai/plugin"
import { createSystemDirective, SystemDirectiveTypes } from "@/shared/hook-utils/system-directive"
import { cacheSessionTokenUsage, clearSessionTokenUsage, getSessionContextUsage } from "./session-usage-cache"
import type { TokenInfo } from "./session-usage-cache"

const ANTHROPIC_DISPLAY_LIMIT = 1_000_000
const DEFAULT_ANTHROPIC_ACTUAL_LIMIT = 200_000
const CONTEXT_WARNING_THRESHOLD = 0.70

type ModelCacheStateLike = {
  anthropicContext1MEnabled: boolean
}

function getAnthropicActualLimit(modelCacheState?: ModelCacheStateLike): number {
  return (modelCacheState?.anthropicContext1MEnabled ?? false) ||
    process.env.ANTHROPIC_1M_CONTEXT === "true" ||
    process.env.VERTEX_ANTHROPIC_1M_CONTEXT === "true"
    ? 1_000_000
    : DEFAULT_ANTHROPIC_ACTUAL_LIMIT
}

const CONTEXT_REMINDER = `${createSystemDirective(SystemDirectiveTypes.CONTEXT_WINDOW_MONITOR)}

You are using Anthropic Claude with 1M context window.
You have plenty of context remaining - do NOT rush or skip tasks.
Complete your work thoroughly and methodically.`

function isAnthropicProvider(providerID: string): boolean {
  return providerID === "anthropic" || providerID === "google-vertex-anthropic"
}

export function createContextWindowMonitorHook(
  _ctx: PluginInput,
  modelCacheState?: ModelCacheStateLike,
) {
  const remindedSessions = new Set<string>()

  const toolExecuteAfter = async (
    input: { tool: string; sessionID: string; callID: string },
    output: { title: string; output: string; metadata: unknown }
  ) => {
    const { sessionID } = input

    if (remindedSessions.has(sessionID)) return

    const usage = getSessionContextUsage(sessionID)
    if (!usage) return

    const actualUsagePercentage =
      usage.usedTokens / getAnthropicActualLimit(modelCacheState)

    if (actualUsagePercentage < CONTEXT_WARNING_THRESHOLD) return

    remindedSessions.add(sessionID)

    const displayUsagePercentage = usage.usedTokens / ANTHROPIC_DISPLAY_LIMIT
    const usedPct = (displayUsagePercentage * 100).toFixed(1)
    const remainingPct = ((1 - displayUsagePercentage) * 100).toFixed(1)
    const usedTokens = usage.usedTokens.toLocaleString()
    const limitTokens = ANTHROPIC_DISPLAY_LIMIT.toLocaleString()

    output.output += `\n\n${CONTEXT_REMINDER}
[Context Status: ${usedPct}% used (${usedTokens}/${limitTokens} tokens), ${remainingPct}% remaining]`
  }

  const eventHandler = async ({ event }: { event: { type: string; properties?: unknown } }) => {
    const props = event.properties as Record<string, unknown> | undefined

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined
      if (sessionInfo?.id) {
        remindedSessions.delete(sessionInfo.id)
        clearSessionTokenUsage(sessionInfo.id)
      }
    }

    if (event.type === "message.updated") {
      const info = props?.info as {
        role?: string
        sessionID?: string
        providerID?: string
        finish?: boolean
        tokens?: TokenInfo
      } | undefined

      if (!info || info.role !== "assistant" || !info.finish) return
      if (!info.sessionID || !info.providerID || !info.tokens) return

      cacheSessionTokenUsage(info.sessionID, info.providerID, info.tokens)
    }
  }

  return {
    "tool.execute.after": toolExecuteAfter,
    event: eventHandler,
  }
}
