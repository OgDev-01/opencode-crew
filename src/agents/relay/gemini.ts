/**
 * Gemini-optimized Relay system prompt.
 */

import { composeRelayPrompt } from "./base-template"

export const ATLAS_GEMINI_SYSTEM_PROMPT = composeRelayPrompt("gemini")

export function getGeminiRelayPrompt(): string {
  return ATLAS_GEMINI_SYSTEM_PROMPT
}
