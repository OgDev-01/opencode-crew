# Refactor Architecture: Incremental, Feature-Safe

This document defines the structural target for `opencode-crew` and an incremental migration path that preserves behavior.

## North-Star Pattern

Use a **Composition Root + Capability Modules** pattern (modular monolith).

- Keep `src/index.ts` as the only composition root.
- Convert each major area into a capability module with one public bootstrap contract and private internals:
  - Runtime: managers and lifecycle bootstrapping
  - Tools: skill context, tool contributors, filtered registry
  - Hooks: ordered hook registration and execution
  - Plugin handlers: event/message/tool/config pipelines
  - Config: load, merge, migrate, resolve, report

Why this fits:

- The existing flow already follows composition (`loadPluginConfig -> createManagers -> createTools -> createHooks -> createPluginInterface`).
- Most breakage risk is from mixed concerns inside handlers and registries, not from missing abstractions.
- This pattern allows strangler-style refactors behind stable public contracts.

## Fallback Pattern

If the full module-contract extraction feels broad for the first milestone, start with a **Unified Handler Pipeline** pattern:

- Keep current modules.
- Standardize handler execution via explicit stage arrays and a shared runner.
- Lock hook/stage order with parity tests before changing internals.

## What Must Stay Stable

- OpenCode hook contracts exposed by `createPluginInterface`.
- Tool names and parameter schemas in the tool registry.
- Config semantics for `disabled_*`, categories, agent overrides, and migration compatibility.
- Existing hook ordering behavior unless explicitly changed with regression coverage.

## Current Bottlenecks (Evidence)

- `src/plugin/event.ts`: monolithic event orchestration + duplicated fallback/retry branches.
- `src/plugin/hooks/create-session-hooks.ts`: large repeated hook wiring logic.
- `src/plugin/tool-registry.ts`: mixed concerns (feature flags, memory wiring, task toggles, multimodal gating).
- `src/features/background-agent/manager.ts`: god class with queueing, lifecycle, notification, fallback, and polling concerns.
- `src/plugin-handlers/agent-config-handler.ts`: broad merge/precedence orchestration.

## Migration Phases

### Phase 1 (1-2 weeks): Risk-Free Structural Hygiene

- Consolidate duplicated utility logic (`isRecord`, error extraction, fallback parsing) into canonical shared modules.
- Normalize model-resolution files into a single coherent submodule.
- Add parity tests for existing behavior before moving code.

Gate:

- `bun run typecheck` passes.
- `bun test` passes.
- `bun run build` passes.

### Phase 2: Background Manager Decomposition

- Keep `BackgroundManager` public API.
- Internally extract:
  - lifecycle coordinator
  - queue/concurrency coordinator
  - notification/result coordinator
- Preserve status transitions and parent notification behavior.

### Phase 3: Prompt Variant Unification

- Remove relay/strategist variant duplication through template + overlay composition.
- Add snapshot tests to guarantee output parity.

### Phase 4: Declarative Hook Registration

- Replace repetitive hook wiring with ordered hook registries.
- Keep return types and ordering semantics stable.

### Phase 5: Shared Module Boundaries

- Reorganize `shared` into coherent submodules with narrow public exports.
- Reduce incidental cross-module coupling.

## Guardrails

- No big-bang rewrite.
- One reversible phase per PR.
- Preserve public contracts first, then refactor internals.
- Prefer extraction and indirection over behavior edits in early phases.

## Suggested First PR Scope

1. Add canonical shared utility module for record/error extraction helpers.
2. Replace duplicate call-sites in `src/plugin/event.ts` and background-agent helper files.
3. Add/adjust tests to lock behavior.
4. Run full verification (`typecheck`, `test`, `build`).
