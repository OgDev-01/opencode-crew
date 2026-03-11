import type { AutoCaptureConfig } from "@/config/schema/memory"
import { subagentSessions } from "@/features/claude-code-session-state"
import { filterContent } from "@/features/memory/privacy-filter"
import type { IMemoryStorage, MemoryScope } from "@/features/memory/types"
import { log } from "@/shared/logger"

export interface MemoryDecisionDetectionDeps {
  storage: IMemoryStorage
  autoCapture?: AutoCaptureConfig
  privacyTags?: string[]
  scope?: MemoryScope
}

type HookInput = {
  sessionID: string
  agent?: string
}

type HookOutput = {
  message: Record<string, unknown>
  parts: Array<{ type: string; text?: string }>
}

const DECISION_PATTERN = /\b(?:let'?s\s+use|i\s+prefer|always\s+(?:use|do|run|commit|ship|merge|deploy)|never\s+(?:use|do|run|commit|ship|merge|deploy)|we\s+should|switch\s+to|install\s+|don'?t\s+(?:use|do)|avoid\s+|stop\s+(?:using|doing))\s+(.+)/i
const USE_TECH_PATTERN = /\buse\s+(typescript|bun)\b/i
const RUN_TESTS_PATTERN = /\brun\s+tests?\s+before\s+commit(?:ting)?\b/i
const NO_CONSOLE_LOG_PATTERN = /\bno\s+console\.log\s+in\s+production\b/i

function extractText(parts: HookOutput["parts"]): string {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .filter((text) => text.length > 0)
    .join("\n")
    .trim()
}

function isUserMessage(message: HookOutput["message"], text: string): boolean {
  const role = message["role"]
  if (typeof role === "string") {
    return role === "user"
  }

  if (/<assistant>|(^|\n)\s*assistant\s*:/i.test(text)) {
    return false
  }

  return true
}

function toSentenceCase(value: string): string {
  if (value.length === 0) return value
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

function detectDecision(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length === 0) return null

  const explicitDecision = normalized.match(DECISION_PATTERN)
  if (explicitDecision?.[1]) {
    return toSentenceCase(explicitDecision[0].trim().replace(/[.!?]+$/, ""))
  }

  const useTech = normalized.match(USE_TECH_PATTERN)
  if (useTech) {
    return toSentenceCase(useTech[0].trim())
  }

  const runTests = normalized.match(RUN_TESTS_PATTERN)
  if (runTests) {
    return toSentenceCase(runTests[0].trim())
  }

  const noConsoleLog = normalized.match(NO_CONSOLE_LOG_PATTERN)
  if (noConsoleLog) {
    return toSentenceCase(noConsoleLog[0].trim())
  }

  return null
}

function computeHash(sessionID: string, summary: string): string {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(`${sessionID}:${summary}`)
  return hasher.digest("hex")
}

export function createMemoryDecisionDetectionHook(deps: MemoryDecisionDetectionDeps) {
  const seenHashes = new Set<string>()
  const privacyTags = deps.privacyTags ?? []
  const scope = deps.scope ?? "project"

  return {
    "chat.message": async (input: HookInput, output: HookOutput): Promise<void> => {
      if (deps.autoCapture?.decision_detection === false) return
      if (subagentSessions.has(input.sessionID)) return

      const promptText = extractText(output.parts)
      if (promptText.length === 0) return
      if (!isUserMessage(output.message, promptText)) return

      const decision = detectDecision(promptText)
      if (!decision) return

      const summary = `Preference: ${decision}`
      const contextHash = computeHash(input.sessionID, summary)

      if (seenHashes.has(contextHash)) return
      seenHashes.add(contextHash)

      const filteredSummary = filterContent(summary, privacyTags)

      try {
        await deps.storage.addGoldenRule({
          id: crypto.randomUUID(),
          rule: filteredSummary,
          domain: scope,
          confidence: 0.8,
          times_validated: 0,
          times_violated: 0,
          source_learning_ids: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      } catch (error) {
        log("[memory-decision-detection] Failed to store golden rule", {
          error: String(error),
        })
      }
    },
  }
}
