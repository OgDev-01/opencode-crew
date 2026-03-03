import type { AvailableSkill } from "../dynamic-agent-prompt-builder"
import type { AgentLoadedSkill, AgentBuiltinSkill, SkillScope } from "@/shared/agent"

function mapScopeToLocation(scope: SkillScope): AvailableSkill["location"] {
  if (scope === "user" || scope === "opencode") return "user"
  if (scope === "project" || scope === "opencode-project") return "project"
  return "plugin"
}

export function buildAvailableSkills(
  discoveredSkills: AgentLoadedSkill[],
  builtinSkills: AgentBuiltinSkill[],
  disabledSkills?: Set<string>
): AvailableSkill[] {
  const builtinSkillNames = new Set(builtinSkills.map(s => s.name))

  const builtinAvailable: AvailableSkill[] = builtinSkills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    location: "plugin" as const,
  }))

  const discoveredAvailable: AvailableSkill[] = discoveredSkills
    .filter(s => !builtinSkillNames.has(s.name) && !disabledSkills?.has(s.name))
    .map((skill) => ({
      name: skill.name,
      description: skill.definition.description ?? "",
      location: mapScopeToLocation(skill.scope),
    }))

  return [...builtinAvailable, ...discoveredAvailable]
}
