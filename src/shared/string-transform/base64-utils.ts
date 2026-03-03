/**
 * Extract raw base64 data from a data URI or pass through raw base64.
 * Extracted from src/tools/look-at/mime-type-inference.ts to break hooks → tools dependency.
 */
export function extractBase64Data(imageData: string): string {
	if (imageData.startsWith("data:")) {
		const commaIndex = imageData.indexOf(",")
		if (commaIndex !== -1) {
			return imageData.slice(commaIndex + 1)
		}
	}
	return imageData
}