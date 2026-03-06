<div align="center">

[![GitHub Release](https://img.shields.io/github/v/release/OgDev-01/opencode-crew?color=369eff&labelColor=black&logo=github&style=flat-square)](https://github.com/OgDev-01/opencode-crew/releases) [![npm version](https://img.shields.io/npm/v/@ogdev/opencode-crew?color=ff6b35&labelColor=black&style=flat-square)](https://www.npmjs.com/package/@ogdev/opencode-crew) [![Discord](https://img.shields.io/discord/1452487457085063218?color=5865F2&label=discord&labelColor=black&logo=discord&logoColor=white&style=flat-square)](https://discord.gg/PUwSMR9XNk) [![License](https://img.shields.io/badge/license-SUL--1.0-white?labelColor=black&style=flat-square)](https://github.com/OgDev-01/opencode-crew/blob/dev/LICENSE.md)

### Multi-agent orchestration for OpenCode.

<img width="1512" height="968" alt="OpenCode Crew" src="https://github.com/user-attachments/assets/cd4613e6-956c-4cad-b44d-7789a0b026ac" />

</div>

opencode-crew adds a coordinated team of 11 specialized AI agents to [OpenCode](https://github.com/anomalyco/opencode). Instead of a single model trying to do everything, you get a parallel workforce: one agent plans, others research and build simultaneously, and the results come back verified and coordinated.

## Why opencode-crew

Most AI coding tools treat every session as a blank slate. Your agents re-discover project conventions, repeat the same mistakes, and burn tokens re-reading context they already processed yesterday. Developers using tools like Cline and Cursor routinely report $100-500/month in token costs, with individual tasks sometimes costing $50+ when context limits hit. opencode-crew was built specifically to solve these two problems.

### Agents that remember (ELF memory system)

Built on the [Emergent Learning Framework](https://github.com/Spacehunterz/Emergent-Learning-Framework_ELF) and refined with ideas from [Claude.ai's memory approach](https://www.anthropic.com/news/memory), ELF gives your agents persistent, cross-session memory. As agents work, they record project-specific patterns, conventions, and decisions into a local SQLite database. The next session loads that context automatically.

Here's what makes ELF different from dropping notes in a markdown file:

- **Automatic promotion**: Individual observations start as learnings with utility scores. When 3+ related learnings accumulate with high confidence (utility > 0.9, accessed 10+ times, older than 7 days), the system synthesizes them into a golden rule. Golden rules are normalized as "Always ..." statements and capped at 5 per scope to prevent bloat.
- **Smart retrieval**: Full-text search with BM25 ranking, boosted by recency (exponential decay with ~60-day half-life) and utility scores. Only relevant memories load into context, not a dump of everything.
- **Privacy by default**: Regex-based filtering strips AWS keys (`AKIA...`), Stripe/OpenAI keys (`sk-...`), GitHub tokens (`ghp_...`), Bearer tokens, and custom `<private>` tags before anything reaches memory. Skips `.env`, `.pem`, and credential files entirely. Zero LLM cost for privacy filtering since it's all heuristic-based.
- **Token-aware injection**: Memory injection starts with a 500-token budget. At 70% context usage, it throttles to golden-rules-only (200 tokens). At 85%, it skips injection entirely. Golden rules always load first; learnings fill remaining budget.

For example: Craftsman discovers your project uses a custom `AppError` wrapper instead of plain `try/catch`. ELF stores this as a learning. After multiple sessions confirm the pattern, it promotes to a golden rule: "Always use AppError for error handling." Every future agent picks it up automatically without re-discovering it.

### Token optimization

Token waste is the hidden cost of AI-assisted development. A single mismanaged context window can burn through $50 of tokens on one task. opencode-crew applies multiple strategies throughout the agent lifecycle to keep costs predictable.

- **Tool output truncation**: Large tool outputs are capped at 50k tokens (10k for web content). Read, edit, and write tools, along with LSP rename, goto-definition, and find-references, are never truncated since their output is always relevant.
- **Preemptive compaction**: At 70% context window usage, the system triggers summarization before hitting the hard limit. This avoids the expensive retry-and-recover cycle that other tools fall into.
- **Multi-strategy context recovery**: When context limits hit, the system first aggressively truncates the largest tool outputs to fit within 50% of the token limit (up to 20 passes). If that's not enough, it falls through to session summarization with retry (max 2 attempts, exponential backoff, 120s timeout). Conditional deduplication and empty-content sanitization handle edge cases during recovery.
- **Smart model routing**: 8 task categories (`quick`, `deep`, `ultrabrain`, `visual-engineering`, `artistry`, `writing`, and two general-purpose tiers) route each task to a cost-appropriate model. A typo fix doesn't need the same model as an architecture redesign.
- **Session continuity**: Agents reuse session IDs to continue conversations without re-sending full context. This alone can save 70%+ tokens on follow-up tasks.

## Installation

Run the installer once and follow the prompts:

```bash
bunx @ogdev/opencode-crew install
```

Supports macOS (ARM and Intel), Linux (x64, ARM, and musl), and Windows. You'll need [OpenCode](https://github.com/anomalyco/opencode) already set up with at least one AI provider configured.

### Staging and experimental versions

The stable install above tracks the `@latest` release. If you want to try newer features before they hit production:

```bash
# Staging (dev branch) — latest merged features, tested but not yet promoted
bunx @ogdev/opencode-crew@next install

# Alpha (experimental) — bleeding-edge, may break
bunx @ogdev/opencode-crew@alpha install
```

You can switch back to stable at any time by re-running the default install command.

### Quick start

After installing, open OpenCode and try a request like:

```bash
# "Captain, add unit tests for the auth module"
# Captain will break it down, delegate to agents, and deliver results
```

## How it works

Captain receives your request and picks an approach based on what you asked for. By default, Captain creates a task list, fires off research agents to gather context, and starts building. For straightforward work, this is fast and effective.

For high-complexity tasks, add "ultrawork" or "ulw" to your prompt. This switches Captain into plan-driven orchestration: a dedicated planning agent breaks your request into a parallel task graph before any code is written. Every step requires full context gathering, mandatory delegation to specialists, and verified completion. No partial deliveries, no skipped requirements, no assumptions without investigation.

The difference in practice:

- **Default mode**: "Add a login page" -> Captain creates a todo, dispatches Lookout to scan your codebase and Archivist to pull auth docs, then builds the feature step by step.
- **Ultrawork mode**: "ultrawork: Rebuild the entire auth system with OAuth, session management, and role-based access" -> Strategist produces a full implementation plan. Archivist and Lookout run 10+ parallel searches. Each agent verifies its output against the plan. Critic checks the result before Captain reports done.

You can also run `/ulw-loop` to start a self-continuing development loop with ultrawork enforced on every iteration. The loop keeps running until the task is complete or hits the max iteration limit, maintaining ultrawork's standards across every cycle.

For example: ask Captain to "add authentication to the API." Strategist breaks it into a concrete plan. Archivist finds the right library and its docs from Context7. Lookout maps your existing auth patterns so nothing gets duplicated. Craftsman writes the implementation across all affected files. Sage reviews the architecture for edge cases. Critic validates the plan was followed. All in one session, with each agent doing what it's designed for.

## Your AI team

Your crew has 11 specialized agents split into four groups by what they do.

### Planning & quality

Captain orchestrates the entire team, while Strategist creates step-by-step plans for complex work. Assessor identifies hidden requirements or gaps before any code is written, and Critic reviews every plan for completeness and verifiability. Before Captain writes a single line, Assessor flags what's missing and Critic confirms the approach is sound.

### Research & context

Archivist searches documentation, GitHub, and the web to find the right APIs and patterns. Lookout performs deep contextual searches across your local codebase to understand what's already there. Spotter interprets images, diagrams, and screenshots so you can hand off a mockup and get working code. Before any implementation starts, Archivist pulls the relevant docs and Lookout maps your existing patterns so nothing gets duplicated.

Spotter is particularly useful for design handoff. Drop a screenshot of a UI or a system diagram into the conversation and Spotter translates what it sees into context agents can act on.

### Execution

Craftsman builds complex features by managing multiple files and logic flows autonomously. Cadet handles focused subtasks delegated by other agents to keep work moving. Relay manages background orchestration, coordinating parallel runs and tracking progress. Craftsman and Cadet can work across your codebase simultaneously, each on a separate piece of the feature.

Relay is what makes long-running tasks reliable. It tracks background jobs, reports status, and cancels stale work automatically so your session doesn't accumulate orphaned processes.

### Advisory

Sage acts as your read-only architecture consultant and debugger. You can ask Sage for high-level design advice or help debugging a tricky race condition without any risk of accidental file changes. It's the one agent that only reads and reasons, never writes.

Sage is especially useful when you're facing a complex bug that spans multiple files or an architectural decision with long-term implications. Because it can't write anything, you get pure analysis with no side effects.

## What ships with it

The plugin comes pre-configured with tools, MCP servers, skills, and commands.

### Tools

You get 25+ tools grouped by capability. Code search covers AST-aware pattern matching (find every `useEffect` that calls an API), semantic grep, and glob. LSP tools let agents jump to definitions, find all references, and rename symbols across the entire workspace in one operation. Task delegation handles parallel agent dispatch with smart category routing. Browser automation via Playwright and media analysis round out the set.

### MCP servers

Three built-in MCP servers extend what agents can access. Web search via Exa pulls live results. Context7 looks up official library documentation. grep.app searches real-world code examples from public repos. Beyond the built-ins, the plugin supports a three-tier MCP system: your local `.mcp.json` config and any MCP servers embedded in skills you install.

### Skills

Four built-in skills ship with the plugin:

- **git-master**: Atomic commits, rebases, squashing, and history search with `git log -S`. No more memorizing flags.
- **playwright**: Browser automation, testing, and screenshot capture via Playwright MCP.
- **dev-browser**: Persistent browser state for multi-step web workflows.
- **frontend-ui-ux**: UI design and implementation guidance without needing a designer or existing mockups.

Browser skills are context-dependent: only one activates at a time based on your task.

### Commands

Eight built-in commands are available immediately after install:

| Command | Description |
|---------|-------------|
| `/start-work` | Start a Captain work session from a Strategist plan |
| `/refactor` | LSP and AST-aware refactoring across the codebase |
| `/handoff` | Save full session context for a clean continuation |
| `/init-deep` | Generate a hierarchical AGENTS.md knowledge base for your project |
| `/ralph-loop` | Start a self-continuing development loop until the task is done |
| `/ulw-loop` | Start a self-continuing loop with ultrawork mode (plan-driven, verified) |
| `/stop-continuation` | Stop all active loops and continuation mechanisms |
| `/cancel-ralph` | Cancel a running Ralph Loop |

## Key features

Beyond memory and token optimization, three more systems set opencode-crew apart.

- **Session continuity**: Agents pass session IDs between tasks so follow-up work picks up exactly where it left off, with full conversation history intact. No re-reading files, no re-explaining context.
- **Smart task routing**: Eight task categories route work to the right model. `quick` for one-file changes, `deep` for research-heavy problems, `ultrabrain` for logic-heavy reasoning, `visual-engineering` for UI work. If your primary model is unavailable, the system falls back automatically across providers.
- **Multi-level config**: Settings cascade from project level to user level to defaults. Override a single model for one agent, disable a tool entirely, or add custom task categories with your own model mapping. Project config is committed to your repo so the whole team shares the same setup.

## Community

Questions, feedback, and contributions are welcome in both places:

- [Discord](https://discord.gg/PUwSMR9XNk): ask questions, share what you build, and get help from the community
- [GitHub](https://github.com/OgDev-01/opencode-crew): file issues, contribute skills, or follow the roadmap

## Acknowledgments

opencode-crew is built upon the foundation of [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode), an outstanding [OpenCode](https://github.com/anomalyco/opencode) plugin that pioneered the multi-agent orchestration patterns used here.
