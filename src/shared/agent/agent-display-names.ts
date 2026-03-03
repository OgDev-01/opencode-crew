/**
 * Agent config keys to display names mapping.
 * Config keys are lowercase (e.g., "captain", "relay").
 * Display names include suffixes for UI/logs (e.g., "Captain (Ultraworker)").
 */
export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  captain: "Captain (Ultraworker)",
  craftsman: "Craftsman (Deep Agent)",
  strategist: "Strategist (Plan Builder)",
  relay: "Relay (Plan Executor)",
  cadet: "Cadet",
  assessor: "Assessor (Plan Consultant)",
  critic: "Critic (Plan Critic)",
  sage: "sage",
  archivist: "archivist",
  lookout: "lookout",
  spotter: "spotter",
}

/**
 * Get display name for an agent config key.
 * Uses case-insensitive lookup for backward compatibility.
 * Returns original key if not found.
 */
export function getAgentDisplayName(configKey: string): string {
  // Try exact match first
  const exactMatch = AGENT_DISPLAY_NAMES[configKey]
  if (exactMatch !== undefined) return exactMatch
  
  // Fall back to case-insensitive search
  const lowerKey = configKey.toLowerCase()
  for (const [k, v] of Object.entries(AGENT_DISPLAY_NAMES)) {
    if (k.toLowerCase() === lowerKey) return v
  }
  
  // Unknown agent: return original key
  return configKey
}

const REVERSE_DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(AGENT_DISPLAY_NAMES).map(([key, displayName]) => [displayName.toLowerCase(), key]),
)

/**
 * Resolve an agent name (display name or config key) to its lowercase config key.
 * "Relay (Plan Executor)" → "relay", "relay" → "relay", "unknown" → "unknown"
 */
export function getAgentConfigKey(agentName: string): string {
  const lower = agentName.toLowerCase()
  const reversed = REVERSE_DISPLAY_NAMES[lower]
  if (reversed !== undefined) return reversed
  if (AGENT_DISPLAY_NAMES[lower] !== undefined) return lower
  return lower
}