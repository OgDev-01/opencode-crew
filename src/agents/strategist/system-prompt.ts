import { STRATEGIST_IDENTITY_CONSTRAINTS } from "./identity-constraints"
import { STRATEGIST_INTERVIEW_MODE } from "./interview-mode"
import { STRATEGIST_PLAN_GENERATION } from "./plan-generation"
import { STRATEGIST_HIGH_ACCURACY_MODE } from "./high-accuracy-mode"
import { STRATEGIST_PLAN_TEMPLATE } from "./plan-template"
import { STRATEGIST_BEHAVIORAL_SUMMARY } from "./behavioral-summary"
import { getGptStrategistPrompt } from "./gpt"
import { getGeminiStrategistPrompt } from "./gemini"
import { isGptModel, isGeminiModel } from "../types"

/**
 * Combined Strategist system prompt (Claude-optimized, default).
 * Assembled from modular sections for maintainability.
 */
export const STRATEGIST_SYSTEM_PROMPT = `${STRATEGIST_IDENTITY_CONSTRAINTS}
${STRATEGIST_INTERVIEW_MODE}
${STRATEGIST_PLAN_GENERATION}
${STRATEGIST_HIGH_ACCURACY_MODE}
${STRATEGIST_PLAN_TEMPLATE}
${STRATEGIST_BEHAVIORAL_SUMMARY}`

/**
 * Strategist planner permission configuration.
 * Allows write/edit for plan files (.md only, enforced by strategist-md-only hook).
 * Question permission allows agent to ask user questions via OpenCode's QuestionTool.
 */
export const STRATEGIST_PERMISSION = {
  edit: "allow" as const,
  bash: "allow" as const,
  webfetch: "allow" as const,
  question: "allow" as const,
}

export type StrategistPromptSource = "default" | "gpt" | "gemini"

/**
 * Determines which Strategist prompt to use based on model.
 */
export function getStrategistPromptSource(model?: string): StrategistPromptSource {
  if (model && isGptModel(model)) {
    return "gpt"
  }
  if (model && isGeminiModel(model)) {
    return "gemini"
  }
  return "default"
}

/**
 * Gets the appropriate Strategist prompt based on model.
 * GPT models → GPT-5.2 optimized prompt (XML-tagged, principle-driven)
 * Gemini models → Gemini-optimized prompt (aggressive tool-call enforcement, thinking checkpoints)
 * Default (Claude, etc.) → Claude-optimized prompt (modular sections)
 */
export function getStrategistPrompt(model?: string): string {
  const source = getStrategistPromptSource(model)

  switch (source) {
    case "gpt":
      return getGptStrategistPrompt()
    case "gemini":
      return getGeminiStrategistPrompt()
    case "default":
    default:
      return STRATEGIST_SYSTEM_PROMPT
  }
}
