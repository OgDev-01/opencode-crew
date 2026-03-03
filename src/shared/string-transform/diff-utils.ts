import { createTwoFilesPatch } from "diff"

/**
 * Generate a unified diff between old and new content.
 * Extracted from src/tools/hashline-edit/diff-utils.ts to break hooks → tools dependency.
 */
export function generateUnifiedDiff(oldContent: string, newContent: string, filePath: string): string {
	return createTwoFilesPatch(filePath, filePath, oldContent, newContent, undefined, undefined, { context: 3 })
}

/**
 * Count line-level additions and deletions between old and new content.
 * Extracted from src/tools/hashline-edit/diff-utils.ts to break hooks → tools dependency.
 */
export function countLineDiffs(oldContent: string, newContent: string): { additions: number; deletions: number } {
	const oldLines = oldContent.split("\n")
	const newLines = newContent.split("\n")

	const oldSet = new Map<string, number>()
	for (const line of oldLines) {
		oldSet.set(line, (oldSet.get(line) ?? 0) + 1)
	}

	const newSet = new Map<string, number>()
	for (const line of newLines) {
		newSet.set(line, (newSet.get(line) ?? 0) + 1)
	}

	let deletions = 0
	for (const [line, count] of oldSet) {
		const newCount = newSet.get(line) ?? 0
		if (count > newCount) {
			deletions += count - newCount
		}
	}

	let additions = 0
	for (const [line, count] of newSet) {
		const oldCount = oldSet.get(line) ?? 0
		if (count > oldCount) {
			additions += count - oldCount
		}
	}

	return { additions, deletions }
}