import { composeCadetPrompt } from "./base-template"

export function buildGeminiCadetPrompt(
  useTaskSystem: boolean,
  promptAppend?: string,
): string {
  return composeCadetPrompt("gemini", useTaskSystem, promptAppend)
}
