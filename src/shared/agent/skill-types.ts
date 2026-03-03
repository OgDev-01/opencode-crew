/**
 * Minimal skill scope type for use in agents/.
 * Mirrors the full SkillScope from features/opencode-skill-loader/types
 * but lives in shared/ to avoid cross-boundary imports.
 */
export type SkillScope = "builtin" | "config" | "user" | "project" | "opencode" | "opencode-project"

/**
 * Minimal loaded skill interface for agent consumption.
 * Structurally compatible with the full LoadedSkill from features/opencode-skill-loader/types.
 * Agents only need name, scope, and definition.description.
 */
export interface AgentLoadedSkill {
  name: string
  scope: SkillScope
  definition: { description?: string }
}

/**
 * Minimal builtin skill interface for agent consumption.
 * Structurally compatible with BuiltinSkill from features/builtin-skills/types.
 * Agents need name and description for skill listing.
 */
export interface AgentBuiltinSkill {
  name: string
  description: string
}

/**
 * Function signature for resolving multiple skill templates by name.
 * Used by agent-builder to inject skill content without depending on features/.
 */
export type SkillResolver = (
  skillNames: string[],
  options?: SkillResolverOptions
) => { resolved: Map<string, string>; notFound: string[] }

export interface SkillResolverOptions {
  gitMasterConfig?: unknown
  browserProvider?: string
  disabledSkills?: Set<string>
}

/**
 * Factory function type for creating builtin skills.
 * Used for dependency injection to avoid agents/ importing from features/.
 */
export type BuiltinSkillFactory = (options?: {
  browserProvider?: string
  disabledSkills?: Set<string>
}) => AgentBuiltinSkill[]
