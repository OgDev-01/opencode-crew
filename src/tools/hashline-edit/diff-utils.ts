import { computeLineHash } from "./hash-computation"

export function toHashlineContent(content: string): string {
	if (!content) return content
	const lines = content.split("\n")
	const lastLine = lines[lines.length - 1]
	const hasTrailingNewline = lastLine === ""
	const contentLines = hasTrailingNewline ? lines.slice(0, -1) : lines
	const hashlined = contentLines.map((line, i) => {
		const lineNum = i + 1
		const hash = computeLineHash(lineNum, line)
		return `${lineNum}#${hash}|${line}`
	})
	return hasTrailingNewline ? hashlined.join("\n") + "\n" : hashlined.join("\n")
}

export { generateUnifiedDiff, countLineDiffs } from "@/shared/string-transform/diff-utils"
