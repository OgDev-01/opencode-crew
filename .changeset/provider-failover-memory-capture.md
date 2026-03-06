---
"@ogdev/opencode-crew": minor
---

Enable automatic provider failover and memory auto-capture

**Runtime fallback (enabled by default)**

- Runtime fallback is now enabled by default with up to 5 fallback attempts, so rate-limited providers seamlessly fail over to connected alternatives without user intervention
- Fallback model chains are auto-derived from agent and category model requirements, filtered by connected providers
- Background-agent sessions are excluded from runtime-fallback to prevent double-fallback with the existing retry handler
- Toast notification when all fallback providers are exhausted, suggesting cooldown or connecting more providers
- Deprecation warning when both `runtime_fallback` and `model_fallback` are enabled

**Memory auto-capture**

- New `memory.auto_capture` config sub-schema for controlling automatic memory capture behavior
- Memory-decision-detection hook captures architectural decisions and convention choices during agent work
- Memory-pre-compaction-flush hook persists pending learnings before context window compaction
- Memory-learning hook now respects privacy tags and excludes subagent sessions
- Captain and Craftsman prompts updated with ELF memory awareness for proactive pattern recording
