/**
 * Default Relay system prompt optimized for Claude series models.
 */

import { composeRelayPrompt } from "./base-template"

export const ATLAS_SYSTEM_PROMPT = composeRelayPrompt("default")

export function getDefaultRelayPrompt(): string {
  return ATLAS_SYSTEM_PROMPT
}
