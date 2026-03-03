/**
 * Cadet - Focused Task Executor
 *
 * Executes delegated tasks directly without spawning other agents.
 * Category-spawned executor with domain-specific configurations.
 *
 * Routing:
 * 1. GPT models (openai/*, github-copilot/gpt-*) -> gpt.ts (GPT-5.2 optimized)
 * 2. Gemini models (google/*, google-vertex/*) -> gemini.ts (Gemini-optimized)
 * 3. Default (Claude, etc.) -> default.ts (Claude-optimized)
 */

import type { AgentConfig } from "@opencode-ai/sdk"
import type { AgentMode } from "../types"
import { isGptModel, isGeminiModel } from "../types"
import type { AgentOverrideConfig } from "@/config/schema"
import { createAgentToolRestrictions,
type PermissionValue, } from "@/shared/file-ops/permission-compat"

import { buildDefaultCadetPrompt } from "./default"
import { buildGptCadetPrompt } from "./gpt"
import { buildGeminiCadetPrompt } from "./gemini"

const MODE: AgentMode = "subagent"

// Core tools that Cadet must NEVER have access to
// Note: call_agent is ALLOWED so subagents can spawn lookout/archivist
const BLOCKED_TOOLS = ["task"]

export const CADET_DEFAULTS = {
  model: "anthropic/claude-sonnet-4-6",
  temperature: 0.1,
} as const

export type CadetPromptSource = "default" | "gpt" | "gemini"

/**
 * Determines which Cadet prompt to use based on model.
 */
export function getCadetPromptSource(model?: string): CadetPromptSource {
  if (model && isGptModel(model)) {
    return "gpt"
  }
  if (model && isGeminiModel(model)) {
    return "gemini"
  }
  return "default"
}

/**
 * Builds the appropriate Cadet prompt based on model.
 */
export function buildCadetPrompt(
  model: string | undefined,
  useTaskSystem: boolean,
  promptAppend?: string
): string {
  const source = getCadetPromptSource(model)

  switch (source) {
    case "gpt":
      return buildGptCadetPrompt(useTaskSystem, promptAppend)
    case "gemini":
      return buildGeminiCadetPrompt(useTaskSystem, promptAppend)
    case "default":
    default:
      return buildDefaultCadetPrompt(useTaskSystem, promptAppend)
  }
}

export function createCadetAgentWithOverrides(
  override: AgentOverrideConfig | undefined,
  systemDefaultModel?: string,
  useTaskSystem = false
): AgentConfig {
  if (override?.disable) {
    override = undefined
  }

  const overrideModel = (override as { model?: string } | undefined)?.model
  const model = overrideModel ?? systemDefaultModel ?? CADET_DEFAULTS.model
  const temperature = override?.temperature ?? CADET_DEFAULTS.temperature

  const promptAppend = override?.prompt_append
  const prompt = buildCadetPrompt(model, useTaskSystem, promptAppend)

  const baseRestrictions = createAgentToolRestrictions(BLOCKED_TOOLS)

  const userPermission = (override?.permission ?? {}) as Record<string, PermissionValue>
  const basePermission = baseRestrictions.permission
  const merged: Record<string, PermissionValue> = { ...userPermission }
  for (const tool of BLOCKED_TOOLS) {
    merged[tool] = "deny"
  }
  merged.call_agent = "allow"
  const toolsConfig = { permission: { ...merged, ...basePermission } }

  const base: AgentConfig = {
    description: override?.description ??
      "Focused task executor. Same discipline, no delegation. (Cadet - OpenCodeCrew)",
    mode: MODE,
    model,
    temperature,
    maxTokens: 64000,
    prompt,
    color: override?.color ?? "#20B2AA",
    ...toolsConfig,
  }

  if (override?.top_p !== undefined) {
    base.top_p = override.top_p
  }

  if (isGptModel(model)) {
    return { ...base, reasoningEffort: "medium" } as AgentConfig
  }

  return {
    ...base,
    thinking: { type: "enabled", budgetTokens: 32000 },
  } as AgentConfig
}

createCadetAgentWithOverrides.mode = MODE
