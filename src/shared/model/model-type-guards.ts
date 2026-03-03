/**
 * Model type guard functions for identifying specific model families.
 * Supports model IDs in various formats (provider/model, model-only, etc).
 */

function extractModelName(model: string): string {
	return model.includes("/") ? model.split("/").pop() ?? model : model
}

export function isGptModel(model: string): boolean {
	const modelName = extractModelName(model).toLowerCase()
	return modelName.includes("gpt")
}

const GEMINI_PROVIDERS = ["google/", "google-vertex/"]

export function isGeminiModel(model: string): boolean {
	if (GEMINI_PROVIDERS.some((prefix) => model.startsWith(prefix)))
		return true

	if (model.startsWith("github-copilot/") && extractModelName(model).toLowerCase().startsWith("gemini"))
		return true

	const modelName = extractModelName(model).toLowerCase()
	return modelName.startsWith("gemini-")
}
