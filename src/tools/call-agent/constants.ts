export const ALLOWED_AGENTS = [
  "lookout",
  "archivist",
  "sage",
  "craftsman",
  "assessor",
  "critic",
  "spotter",
] as const

export const CALL_AGENT_DESCRIPTION = `Spawn lookout/archivist agent. run_in_background REQUIRED (true=async with task_id, false=sync).

Available: {agents}

Pass \`session_id=<id>\` to continue previous agent with full context. Prompts MUST be in English. Use \`background_output\` for async results.`
