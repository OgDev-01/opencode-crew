import { readFileSync } from "node:fs"
import { parseFrontmatter } from "@/shared/frontmatter"

const skillContentCache = new Map<string, string>()

export function getCachedSkillContent(skillPath: string): string | undefined {
	return skillContentCache.get(skillPath)
}

export function loadAndCacheSkillContent(skillPath: string): string {
	const cached = skillContentCache.get(skillPath)
	if (cached !== undefined) return cached

	const content = readFileSync(skillPath, "utf-8")
	const { body } = parseFrontmatter(content)
	const trimmed = body.trim()

	skillContentCache.set(skillPath, trimmed)
	return trimmed
}

export function invalidateSkillContentCache(): void {
	skillContentCache.clear()
}
