import type { IMemoryStorage, Learning, LearningType, MemoryScope } from "@/features/memory/types"
import type { AutoCaptureConfig } from "@/config/schema/memory"
import { filterContent, shouldSkipTool } from "@/features/memory/privacy-filter"
import { log } from "@/shared/logger"
import { subagentSessions } from "@/features/claude-code-session-state"

export interface MemoryLearningDeps {
  storage: IMemoryStorage
  privacyTags?: string[]
  autoCapture?: AutoCaptureConfig
  scope?: MemoryScope
}

type HookInput = { tool: string; sessionID: string; callID: string }
type HookOutput = { title: string; output: string; metadata: Record<string, unknown> } | undefined

const ERROR_PATTERN = /error|failed|not found|permission denied/i

const NOISE_TOOLS = new Set(["Read", "Glob", "Grep"])

function shouldCaptureFailure(tool: string, output: HookOutput): boolean {
  if (!output) return false

  if (tool === "Bash") {
    const hasError = ERROR_PATTERN.test(output.output)
    const nonZeroExit =
      typeof output.metadata?.exitCode === "number" && output.metadata.exitCode !== 0
    return hasError || nonZeroExit
  }

  if (tool === "Edit" || tool === "Write") {
    const attempt = typeof output.metadata?.attempt === "number" ? output.metadata.attempt : 1
    return attempt > 1
  }

  return false
}

function shouldCaptureOriginal(tool: string, output: HookOutput): boolean {
  if (!output) return false
  if (shouldSkipTool(tool)) return false

  if (output.metadata?.memory_capture === true) return true

  if (NOISE_TOOLS.has(tool)) return false

  return shouldCaptureFailure(tool, output)
}

function matchesCapturePattern(output: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    try {
      if (new RegExp(pattern, "i").test(output)) return true
    } catch {
      continue
    }
  }
  return false
}

function shouldCapture(tool: string, output: HookOutput, config?: AutoCaptureConfig): boolean {
  if (!config || config.enabled === false) {
    return shouldCaptureOriginal(tool, output)
  }

  if (!output) return false

  if (output.metadata?.memory_capture === true) return true

  if (shouldSkipTool(tool)) return false

  const captureTools = config.capture_tools ?? []
  const skipTools = config.skip_tools ?? ["Read", "Glob", "Grep"]

  if (captureTools.length > 0 && !captureTools.includes(tool)) return false
  if (captureTools.length === 0 && skipTools.includes(tool)) return false

  if (matchesCapturePattern(output.output, config.patterns ?? [])) return true

  const onFailure = config.on_failure ?? true
  if (onFailure && shouldCaptureFailure(tool, output)) return true

  const onSuccess = config.on_success ?? false
  if (!onSuccess) return false

  if (tool === "Bash") {
    const exitCode = output.metadata?.exitCode
    const isSuccess = typeof exitCode !== "number" || exitCode === 0
    return isSuccess && output.output.length > 50
  }

  if (tool === "Edit" || tool === "Write") {
    const attempt = typeof output.metadata?.attempt === "number" ? output.metadata.attempt : 1
    return attempt === 1
  }

  if (tool === "task" || tool === "delegate_task") {
    return true
  }

  return false
}

function classifyType(output: string): LearningType {
  if (ERROR_PATTERN.test(output)) return "failure"
  return "observation"
}

function buildSummary(tool: string, output: string): string {
  const firstLine = output.split("\n")[0] ?? ""
  return `${tool}: ${firstLine.slice(0, 100)}`
}

function computeHash(tool: string, sessionID: string, scope: string, summary: string): string {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(`${tool}:${sessionID}:${scope}:${summary.slice(0, 100)}`)
  return hasher.digest("hex")
}

export function createMemoryLearningHook(deps: MemoryLearningDeps) {
  const seenHashes = new Set<string>()
  const privacyTags = deps.privacyTags ?? []
  const scope = deps.scope ?? "project"

  return {
    "tool.execute.after": async (input: HookInput, output: HookOutput): Promise<void> => {
      if (subagentSessions.has(input.sessionID)) return
      if (!shouldCapture(input.tool, output, deps.autoCapture)) return

      const summary = buildSummary(input.tool, output!.output)
      const contextHash = computeHash(input.tool, input.sessionID, scope, summary)

      if (seenHashes.has(contextHash)) return
      seenHashes.add(contextHash)

      const filteredContext = filterContent(output!.output, privacyTags)
      const learningType = classifyType(output!.output)

      const learning: Learning = {
        id: crypto.randomUUID(),
        type: learningType,
        summary,
        context: filteredContext,
        tool_name: input.tool,
        domain: scope,
        tags: [input.tool.toLowerCase()],
        utility_score: 0.5,
        times_consulted: 0,
        context_hash: contextHash,
        confidence: 0.5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      try {
        await deps.storage.addLearning(learning)
      } catch (error) {
        log("[memory-learning] Failed to store learning", { error: String(error) })
      }
    },
  }
}
