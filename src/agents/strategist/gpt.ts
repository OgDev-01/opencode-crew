import { composeStrategistPrompt } from "./base-template"

export const STRATEGIST_GPT_SYSTEM_PROMPT = composeStrategistPrompt("gpt")

export function getGptStrategistPrompt(): string {
  return STRATEGIST_GPT_SYSTEM_PROMPT
}
