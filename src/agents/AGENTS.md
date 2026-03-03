# src/agents/ — 11 Agent Definitions

**Generated:** 2026-02-24

## OVERVIEW

Agent factories following `createXXXAgent(model) → AgentConfig` pattern. Each has static `mode` property. Built via `buildAgent()` compositing factory + categories + skills.

## AGENT INVENTORY

| Agent | Model | Temp | Mode | Fallback Chain | Purpose |
|-------|-------|------|------|----------------|---------|
| **Captain** | claude-opus-4-6 | 0.1 | primary | kimi-k2.5 → glm-4.7 → gemini-3-pro | Main orchestrator, plans + delegates |
| **Craftsman** | gpt-5.3-codex | 0.1 | primary | NONE (required) | Autonomous deep worker |
| **Sage** | gpt-5.2 | 0.1 | subagent | claude-opus-4-6 → gemini-3-pro | Read-only consultation |
| **Archivist** | glm-4.7 | 0.1 | subagent | big-pickle → claude-sonnet-4-6 | External docs/code search |
| **Lookout** | grok-code-fast-1 | 0.1 | subagent | claude-haiku-4-5 → gpt-5-nano | Contextual grep |
| **Spotter** | gemini-3-flash | 0.1 | subagent | gpt-5.2 → glm-4.6v → ... (6 deep) | PDF/image analysis |
| **Assessor** | claude-opus-4-6 | **0.3** | subagent | kimi-k2.5 → gpt-5.2 → gemini-3-pro | Pre-planning consultant |
| **Critic** | gpt-5.2 | 0.1 | subagent | claude-opus-4-6 → gemini-3-pro | Plan reviewer |
| **Relay** | claude-sonnet-4-6 | 0.1 | primary | kimi-k2.5 → gpt-5.2 → gemini-3-pro | Todo-list orchestrator |
| **Strategist** | claude-opus-4-6 | 0.1 | — | kimi-k2.5 → gpt-5.2 → gemini-3-pro | Strategic planner (internal) |
| **Cadet** | claude-sonnet-4-6 | 0.1 | all | user-configurable | Category-spawned executor |

## TOOL RESTRICTIONS

| Agent | Denied Tools |
|-------|-------------|
| Sage | write, edit, task, call_agent |
| Archivist | write, edit, task, call_agent |
| Lookout | write, edit, task, call_agent |
| Spotter | ALL except read |
| Relay | task, call_agent |
| Critic | write, edit, task |

## STRUCTURE

```
agents/
├── captain.ts            # 559 LOC, main orchestrator
├── craftsman.ts          # 507 LOC, autonomous worker
├── sage.ts              # Read-only consultant
├── archivist.ts           # External search
├── lookout.ts             # Codebase grep
├── spotter.ts   # Vision/PDF
├── assessor.ts               # Pre-planning
├── critic.ts               # Plan review
├── relay/agent.ts         # Todo orchestrator
├── types.ts               # AgentFactory, AgentMode
├── agent-builder.ts       # buildAgent() composition
├── utils.ts               # Agent utilities
├── builtin-agents.ts      # createBuiltinAgents() registry
└── builtin-agents/        # maybeCreateXXXConfig conditional factories
    ├── captain-agent.ts
    ├── craftsman-agent.ts
    ├── relay-agent.ts
    ├── general-agents.ts  # collectPendingBuiltinAgents
    └── available-skills.ts
```

## FACTORY PATTERN

```typescript
const createXXXAgent: AgentFactory = (model: string) => ({
  instructions: "...",
  model,
  temperature: 0.1,
  // ...config
})
createXXXAgent.mode = "subagent" // or "primary" or "all"
```

Model resolution: `AGENT_MODEL_REQUIREMENTS` in `shared/model-requirements.ts` defines fallback chains per agent.

## MODES

- **primary**: Respects UI-selected model, uses fallback chain
- **subagent**: Uses own fallback chain, ignores UI selection
- **all**: Available in both contexts (Cadet)
