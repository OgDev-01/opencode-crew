export { buildDefaultCadetPrompt } from "./default"
export { buildGptCadetPrompt } from "./gpt"
export { buildGeminiCadetPrompt } from "./gemini"

export {
  CADET_DEFAULTS,
  getCadetPromptSource,
  buildCadetPrompt,
  createCadetAgentWithOverrides,
} from "./agent"
export type { CadetPromptSource } from "./agent"
