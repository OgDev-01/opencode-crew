/**
 * Hash alphabet and lookup table for hashline LINE#ID tags.
 * Extracted from src/tools/hashline-edit/constants.ts to break hooks → tools dependency.
 */
export const NIBBLE_STR = "ZPMQVRWSNKTXJBYH"

export const HASHLINE_DICT = Array.from({ length: 256 }, (_, i) => {
	const high = i >>> 4
	const low = i & 0x0f
	return `${NIBBLE_STR[high]}${NIBBLE_STR[low]}`
})

const RE_SIGNIFICANT = /[\p{L}\p{N}]/u

/**
 * Compute a 2-char content hash for a line.
 * Extracted from src/tools/hashline-edit/hash-computation.ts to break hooks → tools dependency.
 */
export function computeLineHash(lineNumber: number, content: string): string {
	const stripped = content.endsWith("\r") ? content.slice(0, -1).replace(/\s+/g, "") : content.replace(/\s+/g, "")
	const seed = RE_SIGNIFICANT.test(stripped) ? 0 : lineNumber
	const hash = Bun.hash.xxHash32(stripped, seed)
	const index = hash % 256
	return HASHLINE_DICT[index]
}