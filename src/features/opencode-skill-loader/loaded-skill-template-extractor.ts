import { loadAndCacheSkillContent } from "./skill-content-cache"
import type { LoadedSkill } from "./types"

export function extractSkillTemplate(skill: LoadedSkill): string {
	if (skill.path) {
		return loadAndCacheSkillContent(skill.path)
	}
	return skill.definition.template || ""
}
