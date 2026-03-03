import { composeCadetPrompt } from "./base-template"

export function buildGptCadetPrompt(
  useTaskSystem: boolean,
  promptAppend?: string,
): string {
  return composeCadetPrompt("gpt", useTaskSystem, promptAppend)
}
