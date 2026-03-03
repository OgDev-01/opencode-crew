/**
 * Agent tool restrictions for session.prompt calls.
 * OpenCode SDK's session.prompt `tools` parameter expects boolean values.
 * true = tool allowed, false = tool denied.
 *
 * Config overrides (from agent_overrides.tools) are merged on top of hardcoded
 * AGENT_RESTRICTIONS defaults. Config wins on conflict.
 */

const EXPLORATION_AGENT_DENYLIST: Record<string, boolean> = {
  write: false,
  edit: false,
  task: false,
  call_agent: false,
}

const AGENT_RESTRICTIONS: Record<string, Record<string, boolean>> = {
  lookout: EXPLORATION_AGENT_DENYLIST,

  archivist: EXPLORATION_AGENT_DENYLIST,

  sage: {
    write: false,
    edit: false,
    task: false,
    call_agent: false,
  },

  assessor: {
    write: false,
    edit: false,
    task: false,
  },

  critic: {
    write: false,
    edit: false,
    task: false,
  },

  spotter: {
    read: true,
  },

  cadet: {
    task: false,
  },
}

let agentToolOverrides: Record<string, Record<string, boolean>> = {}

export function setAgentToolOverrides(agentName: string, tools: Record<string, boolean>): void {
  agentToolOverrides[agentName] = tools
}

export function clearAgentToolOverrides(): void {
  agentToolOverrides = {}
}

function getHardcodedRestrictions(agentName: string): Record<string, boolean> {
  return AGENT_RESTRICTIONS[agentName]
    ?? Object.entries(AGENT_RESTRICTIONS).find(([key]) => key.toLowerCase() === agentName.toLowerCase())?.[1]
    ?? {}
}

export function getAgentToolRestrictions(agentName: string): Record<string, boolean> {
  const hardcoded = getHardcodedRestrictions(agentName)
  const overrides = agentToolOverrides[agentName]
    ?? Object.entries(agentToolOverrides).find(([key]) => key.toLowerCase() === agentName.toLowerCase())?.[1]
  if (!overrides) return hardcoded
  return { ...hardcoded, ...overrides }
}

export function hasAgentToolRestrictions(agentName: string): boolean {
  const restrictions = getAgentToolRestrictions(agentName)
  return Object.keys(restrictions).length > 0
}
