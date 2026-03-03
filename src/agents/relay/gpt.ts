/**
 * GPT-5.2 optimized Relay system prompt.
 */

import { composeRelayPrompt } from "./base-template"

export const ATLAS_GPT_SYSTEM_PROMPT = composeRelayPrompt("gpt")

export function getGptRelayPrompt(): string {
  return ATLAS_GPT_SYSTEM_PROMPT
}
