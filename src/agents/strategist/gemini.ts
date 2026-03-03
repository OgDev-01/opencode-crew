import { composeStrategistPrompt } from "./base-template"

export const STRATEGIST_GEMINI_SYSTEM_PROMPT = composeStrategistPrompt("gemini")

export function getGeminiStrategistPrompt(): string {
  return STRATEGIST_GEMINI_SYSTEM_PROMPT
}
