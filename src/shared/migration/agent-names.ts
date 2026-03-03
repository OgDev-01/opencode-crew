export const AGENT_NAME_MAP: Record<string, string> = {
  // Sisyphus variants → "captain" (crew name)
  omo: "captain",
  OmO: "captain",
  Sisyphus: "captain",
  sisyphus: "captain",

  // Prometheus variants → "strategist" (crew name)
  "OmO-Plan": "strategist",
  "omo-plan": "strategist",
  "Planner-Sisyphus": "strategist",
  "planner-sisyphus": "strategist",
  "Prometheus (Planner)": "strategist",
  prometheus: "strategist",

  // Atlas variants → "relay" (crew name)
  "orchestrator-sisyphus": "relay",
  Atlas: "relay",
  atlas: "relay",

  // Metis variants → "assessor" (crew name)
  "plan-consultant": "assessor",
  "Metis (Plan Consultant)": "assessor",
  metis: "assessor",

  // Momus variants → "critic" (crew name)
  "Momus (Plan Reviewer)": "critic",
  momus: "critic",

  // Sisyphus-Junior variants → "cadet" (crew name)
  "Sisyphus-Junior": "cadet",
  "sisyphus-junior": "cadet",

  // Hephaestus, Oracle, Librarian, Explore, Multimodal-Looker → crew names (legacy mythology names)
  hephaestus: "craftsman",
  oracle: "sage",
  librarian: "archivist",
  explore: "lookout",
  "multimodal-looker": "spotter",
  build: "build",
}

export const BUILTIN_AGENT_NAMES = new Set([
  "captain",
  "craftsman",
  "sage",
  "archivist",
  "lookout",
  "spotter",
  "assessor",
  "critic",
  "relay",
  "cadet",
  "strategist",
  "build",
])

export function migrateAgentNames(
  agents: Record<string, unknown>
): { migrated: Record<string, unknown>; changed: boolean } {
  const migrated: Record<string, unknown> = {}
  let changed = false

  for (const [key, value] of Object.entries(agents)) {
    const newKey = AGENT_NAME_MAP[key.toLowerCase()] ?? AGENT_NAME_MAP[key] ?? key
    if (newKey !== key) {
      changed = true
    }
    migrated[newKey] = value
  }

  return { migrated, changed }
}
