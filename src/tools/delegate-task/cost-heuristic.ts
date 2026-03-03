import { estimateTokenCount } from "@/features/memory/token-counter"
import { log } from "@/shared/logger"

const DELEGATION_OVERHEAD_TOKENS = 3500
const ALWAYS_DELEGATE_CATEGORIES = new Set(["deep", "ultrabrain", "visual-engineering"])

export interface CostHeuristicInput {
  category: string
  prompt: string
  fileCount?: number
}

export interface CostHeuristicResult {
  decision: "delegate" | "suggest-inline"
  reason: string
  estimatedOverhead: number
}

export function shouldDelegateOrInline(args: CostHeuristicInput): CostHeuristicResult {
  const fileCount = args.fileCount ?? 1
  const promptTokens = estimateTokenCount(args.prompt)

  if (ALWAYS_DELEGATE_CATEGORIES.has(args.category)) {
    return createResult(args, fileCount, promptTokens, "delegate", `${args.category} category always delegates for specialized execution`)
  }

  if (fileCount >= 3) {
    return createResult(args, fileCount, promptTokens, "delegate", `task touches ${fileCount} files, delegation is preferred`)
  }

  if (promptTokens > 500 && fileCount > 1) {
    return createResult(
      args,
      fileCount,
      promptTokens,
      "delegate",
      `prompt is large (${promptTokens} tokens) and spans multiple files`,
    )
  }

  if (args.category === "quick" && args.prompt.length < 200 && fileCount <= 1) {
    return createResult(
      args,
      fileCount,
      promptTokens,
      "suggest-inline",
      "quick single-file task with short prompt is a good inline candidate",
    )
  }

  return createResult(
    args,
    fileCount,
    promptTokens,
    "delegate",
    "defaulting to delegation for safer execution",
  )
}

function createResult(
  args: CostHeuristicInput,
  fileCount: number,
  promptTokens: number,
  decision: CostHeuristicResult["decision"],
  reason: string,
): CostHeuristicResult {
  const result: CostHeuristicResult = {
    decision,
    reason,
    estimatedOverhead: DELEGATION_OVERHEAD_TOKENS,
  }

  log("[delegate-task] delegation cost heuristic decision", {
    category: args.category,
    fileCount,
    promptTokens,
    decision,
    reason,
    estimatedOverhead: result.estimatedOverhead,
  })

  return result
}
