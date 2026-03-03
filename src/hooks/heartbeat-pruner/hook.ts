import { log } from "@/shared/logger"
import { estimateTokensForContent as estimateTokens } from "@/shared/token-metrics"

const RECENT_PAIRS_TO_KEEP = 5
const FILE_MODIFYING_TOOLS = new Set(["edit", "write"])
const NAVIGATION_ONLY_PATTERN = /^\s*(cd\s|ls\b)/

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string | ContentBlock[] }

interface Message {
  role: "user" | "assistant"
  content: ContentBlock[] | string
}

type TransformHandler = (
  input: { messages: Message[]; sessionID: string },
  output: { messages: Message[] }
) => Promise<void>

interface ToolCallPair {
  assistantIdx: number
  userIdx: number
  toolName: string
  toolInput: Record<string, unknown>
  resultContent: string
}

function getResultText(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content
  return content.map((b) => ("text" in b ? b.text : "")).join("")
}

function isCleanDiagnostics(name: string, resultText: string): boolean {
  if (name !== "lsp_diagnostics") return false
  const lower = resultText.toLowerCase()
  return lower.includes("no errors") || lower.includes("0 errors") || lower.trim() === ""
}

function hasError(name: string, resultText: string): boolean {
  if (isCleanDiagnostics(name, resultText)) return false
  const lower = resultText.toLowerCase()
  return lower.includes("error") || lower.includes("non-zero exit code") || lower.includes("failed")
}

function isNavigationOnlyBash(name: string, input: Record<string, unknown>): boolean {
  if (name !== "bash") return false
  const cmd = String(input.command ?? "").trim()
  return NAVIGATION_ONLY_PATTERN.test(cmd) && !cmd.includes("&&") && !cmd.includes(";")
}

function isBashWithSideEffects(name: string, input: Record<string, unknown>): boolean {
  if (name !== "bash") return false
  return !isNavigationOnlyBash(name, input)
}

const ZERO_MATCH_TOOLS = new Set(["glob", "grep", "mgrep"])

function isZeroMatchResult(name: string, resultText: string): boolean {
  if (!ZERO_MATCH_TOOLS.has(name)) return false
  const lower = resultText.toLowerCase().trim()
  if (lower === "" || lower === "[]") return true
  return (
    lower.includes("no files found") ||
    lower.includes("no matches found") ||
    lower.includes("no results found") ||
    lower.includes("no matches")
  )
}

function isRedundantSameFileRead(pair: ToolCallPair, pairs: ToolCallPair[], pairIdx: number): boolean {
  if (pair.toolName !== "read") return false
  const filePath = pair.toolInput.filePath
  if (typeof filePath !== "string") return false
  for (let i = 0; i < pairIdx; i++) {
    const earlier = pairs[i]
    if (earlier.toolName === "read" && earlier.toolInput.filePath === filePath) return true
  }
  return false
}

function isZeroInfoCall(pair: ToolCallPair, pairs: ToolCallPair[], pairIdx: number): boolean {
  if (pair.toolName === "todowrite") return true
  if (isCleanDiagnostics(pair.toolName, pair.resultContent)) return true
  if (isNavigationOnlyBash(pair.toolName, pair.toolInput)) return true
  if (isZeroMatchResult(pair.toolName, pair.resultContent)) return true
  if (isRedundantSameFileRead(pair, pairs, pairIdx)) return true
  return false
}

function shouldNeverPrune(pair: ToolCallPair): boolean {
  if (hasError(pair.toolName, pair.resultContent)) return true
  if (FILE_MODIFYING_TOOLS.has(pair.toolName)) return true
  if (isBashWithSideEffects(pair.toolName, pair.toolInput)) return true
  return false
}

function extractToolPairs(messages: Message[]): ToolCallPair[] {
  const pairs: ToolCallPair[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue

    for (const block of msg.content) {
      if (block.type !== "tool_use") continue
      const toolUse = block as { id: string; name: string; input: Record<string, unknown> }

      for (let j = i + 1; j < messages.length; j++) {
        const resultMsg = messages[j]
        if (resultMsg.role !== "user" || !Array.isArray(resultMsg.content)) continue

        const resultBlock = (resultMsg.content as ContentBlock[]).find(
          (b) => b.type === "tool_result" && (b as { tool_use_id: string }).tool_use_id === toolUse.id
        )
        if (resultBlock) {
          const resultText = getResultText((resultBlock as { content: string | ContentBlock[] }).content)
          pairs.push({
            assistantIdx: i,
            userIdx: j,
            toolName: toolUse.name,
            toolInput: toolUse.input,
            resultContent: resultText,
          })
          break
        }
      }
    }
  }

  return pairs
}

function findDuplicatePairs(pairs: ToolCallPair[], recentCutoff: number): Set<number> {
  const seen = new Map<string, number>()
  const duplicateIndices = new Set<number>()

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]
    if (pair.assistantIdx >= recentCutoff) continue
    const key = `${pair.toolName}:${JSON.stringify(pair.toolInput)}`
    if (seen.has(key)) {
      duplicateIndices.add(i)
    }
    seen.set(key, i)
  }

  return duplicateIndices
}

function buildSummary(prunedNames: string[]): string {
  const counts = new Map<string, number>()
  for (const name of prunedNames) {
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const breakdown = Array.from(counts.entries())
    .map(([name, count]) => `${name} x${count}`)
    .join(", ")
  return `[Pruned: ${prunedNames.length} tool calls (${breakdown}) — no information lost]`
}

export function createHeartbeatPrunerHook(): { "experimental.chat.messages.transform": TransformHandler } {
  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      const { messages } = output
      if (!messages || messages.length < 2) return

      const pairs = extractToolPairs(messages)
      if (pairs.length <= RECENT_PAIRS_TO_KEEP) return

      const recentStartPairIdx = pairs.length - RECENT_PAIRS_TO_KEEP
      const recentCutoff = pairs[recentStartPairIdx].assistantIdx
      const duplicates = findDuplicatePairs(pairs, recentCutoff)

      const indicesToPrune = new Set<number>()
      const prunedNames: string[] = []

      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i]
        if (pair.assistantIdx >= recentCutoff) continue
        if (shouldNeverPrune(pair)) continue
        if (isZeroInfoCall(pair, pairs, i) || duplicates.has(i)) {
          indicesToPrune.add(pair.assistantIdx)
          indicesToPrune.add(pair.userIdx)
          prunedNames.push(pair.toolName)
        }
      }

      if (prunedNames.length === 0) return

      let tokensSaved = 0
      const newMessages: Message[] = []
      let consecutivePruned: string[] = []

      function flushPruned() {
        if (consecutivePruned.length > 0) {
          newMessages.push({
            role: "user",
            content: buildSummary(consecutivePruned),
          })
          consecutivePruned = []
        }
      }

      for (let i = 0; i < messages.length; i++) {
        if (indicesToPrune.has(i)) {
          const msg = messages[i]
          tokensSaved += estimateTokens(
            typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)
          )
          if (msg.role === "assistant") {
            const toolBlock = Array.isArray(msg.content)
              ? msg.content.find((b) => b.type === "tool_use")
              : undefined
            if (toolBlock) {
              consecutivePruned.push((toolBlock as { name: string }).name)
            }
          }
          continue
        }
        flushPruned()
        newMessages.push(messages[i])
      }
      flushPruned()

      output.messages = newMessages
      log(`heartbeat-pruner: saved ~${tokensSaved} tokens`)
    },
  }
}
