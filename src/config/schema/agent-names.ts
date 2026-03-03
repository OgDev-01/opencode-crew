import { z } from "zod"

export const BuiltinAgentNameSchema = z.enum([
  "captain",
  "craftsman",
  "strategist",
  "sage",
  "archivist",
  "lookout",
  "spotter",
  "assessor",
  "critic",
  "relay",
])

export const BuiltinSkillNameSchema = z.enum([
  "playwright",
  "agent-browser",
  "dev-browser",
  "frontend-ui-ux",
  "git-master",
])

export const OverridableAgentNameSchema = z.enum([
  "build",
  "plan",
  "captain",
  "craftsman",
  "cadet",
  "OpenCode-Builder",
  "strategist",
  "assessor",
  "critic",
  "sage",
  "archivist",
  "lookout",
  "spotter",
  "relay",
])

export const AgentNameSchema = BuiltinAgentNameSchema
export type AgentName = z.infer<typeof AgentNameSchema>

export type BuiltinSkillName = z.infer<typeof BuiltinSkillNameSchema>
