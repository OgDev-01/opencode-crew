export type AgentsMdTier = "full" | "summary" | "minimal" | "skip"

const FULL_CATEGORIES = new Set(["deep", "ultrabrain"])
const SUMMARY_CATEGORIES = new Set(["visual-engineering"])
const MINIMAL_CATEGORIES = new Set(["unspecified-high", "quick", "unspecified-low", "artistry", "writing"])
const SKIP_CATEGORIES = new Set(["free"])

const SUMMARY_SECTIONS = new Set(["OVERVIEW", "CONVENTIONS", "ANTI-PATTERNS", "WHERE TO LOOK"])
const MINIMAL_SECTIONS = new Set(["CONVENTIONS", "ANTI-PATTERNS"])

const SECTION_HEADER_REGEX = /^## (.+)$/

export function getCategoryTier(category: string | undefined): AgentsMdTier {
	if (!category) return "minimal"
	if (SKIP_CATEGORIES.has(category)) return "skip"
	if (FULL_CATEGORIES.has(category)) return "full"
	if (SUMMARY_CATEGORIES.has(category)) return "summary"
	if (MINIMAL_CATEGORIES.has(category)) return "minimal"
	return "minimal"
}

export function parseAgentsMdSections(content: string): Record<string, string> {
	if (!content.trim()) return {}

	const sections: Record<string, string> = {}
	const lines = content.split("\n")

	let currentSection: string | null = null
	let currentLines: string[] = []

	for (const line of lines) {
		const match = line.match(SECTION_HEADER_REGEX)
		if (match) {
			if (currentSection !== null) {
				sections[currentSection] = currentLines.join("\n")
			} else if (currentLines.length > 0) {
				sections["_preamble"] = currentLines.join("\n")
			}
			currentSection = match[1]
			currentLines = []
		} else {
			currentLines.push(line)
		}
	}

	if (currentSection !== null) {
		sections[currentSection] = currentLines.join("\n")
	} else if (currentLines.length > 0) {
		sections["_preamble"] = currentLines.join("\n")
	}

	return sections
}

export function buildTieredAgentsMd(content: string, tier: AgentsMdTier): string {
	if (tier === "full") return content
	if (tier === "skip") return ""

	const allowedSections = tier === "summary" ? SUMMARY_SECTIONS : MINIMAL_SECTIONS
	const sections = parseAgentsMdSections(content)

	const parts: string[] = []
	for (const [name, body] of Object.entries(sections)) {
		if (name === "_preamble") continue
		if (allowedSections.has(name)) {
			parts.push(`## ${name}\n${body}`)
		}
	}

	return parts.join("\n")
}
