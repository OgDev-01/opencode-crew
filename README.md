<div align="center">

[![GitHub Release](https://img.shields.io/github/v/release/OgDev-01/opencode-crew?color=369eff&labelColor=black&logo=github&style=flat-square)](https://github.com/OgDev-01/opencode-crew/releases) [![npm version](https://img.shields.io/npm/v/@ogdev/opencode-crew?color=ff6b35&labelColor=black&style=flat-square)](https://www.npmjs.com/package/@ogdev/opencode-crew) [![Discord](https://img.shields.io/discord/1452487457085063218?color=5865F2&label=discord&labelColor=black&logo=discord&logoColor=white&style=flat-square)](https://discord.gg/PUwSMR9XNk) [![License](https://img.shields.io/badge/license-SUL--1.0-white?labelColor=black&style=flat-square)](https://github.com/OgDev-01/opencode-crew/blob/dev/LICENSE.md)

### Multi-agent orchestration for OpenCode.

<img width="1512" height="968" alt="OpenCode Crew" src="https://github.com/user-attachments/assets/cd4613e6-956c-4cad-b44d-7789a0b026ac" />

</div>

opencode-crew adds a coordinated team of 11 specialized AI agents to [OpenCode](https://github.com/anomalyco/opencode). Instead of a single model trying to do everything, you get a parallel workforce: one agent plans, others research and build simultaneously, and the results come back verified and coordinated.

## Installation

Run the installer once and follow the prompts:

```bash
bunx @ogdev/opencode-crew install
```

Supports macOS (ARM and Intel), Linux (x64, ARM, and musl), and Windows.

You'll need [OpenCode](https://github.com/anomalyco/opencode) already set up with at least one AI provider configured. The installer walks you through plugin activation and verifies your environment with a built-in doctor check.

## How it works

OpenCode Crew replaces single-prompt interactions with a structured multi-agent process. Captain receives your request, breaks it into a plan, and delegates to specialists who run in parallel.

1. Install the plugin once to activate the crew in your environment.
2. Captain reads your request and creates a detailed implementation plan.
3. Specialized agents run in parallel: Archivist searches docs, Lookout maps your codebase, Craftsman builds.
4. Results come back coordinated and verified, not scattered across multiple prompts.

For example: ask Captain to "add authentication to the API." Strategist breaks it into a concrete plan. Archivist finds the right library and its docs from Context7. Lookout maps your existing auth patterns so nothing gets duplicated. Craftsman writes the implementation across all affected files. Sage reviews the architecture for edge cases. Critic validates the plan was followed. All in one session, with each agent doing what it's designed for.

## Your AI team

Your crew has 11 specialized agents split into four groups by what they do.

### Planning & quality

Captain orchestrates the entire team, while Strategist creates step-by-step plans for complex work. Assessor identifies hidden requirements or gaps before any code is written, and Critic reviews every plan for completeness and verifiability. Before Captain writes a single line, Assessor flags what's missing and Critic confirms the approach is sound.

This group is especially useful for large or ambiguous requests. When you ask for something complex, Assessor surfaces the questions you didn't think to ask and Critic ensures the answer actually solves the original problem.

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
| `/ulw-loop` | Ultrawork loop for high-complexity tasks |
| `/stop-continuation` | Stop all active loops and continuation mechanisms |
| `/cancel-ralph` | Cancel a running Ralph Loop |

## Key features

Three systems set opencode-crew apart from a basic agent wrapper.

### Cross-session memory

The ELF (Emergent Learning Framework) memory system lets agents carry knowledge across sessions. As you work, agents record patterns, decisions, and project-specific conventions. On the next session, that context loads automatically. Privacy filtering keeps sensitive data out of memory, and automatic consolidation prevents duplicates from building up.

For example: if Craftsman discovers your project uses a custom error-handling wrapper instead of plain `try/catch`, ELF stores that as a golden rule. Every future agent session picks it up automatically, so no one has to re-discover it.

### Smart task routing

Eight task categories route work to the right model for the job: `quick` for trivial one-file changes, `deep` for thorough research-first problem solving, `ultrabrain` for logic-heavy reasoning tasks, `visual-engineering` for UI and design work, `artistry` for unconventional solutions, `writing` for documentation, and `unspecified-low` / `unspecified-high` for tasks that don't fit elsewhere. Each maps to a model optimized for that workload. If your primary model is unavailable, the system falls back automatically across providers: Claude, Gemini, OpenAI, and others.

You can also add custom categories in your config with your own model mapping, so specialized workloads always hit the right provider.

### Multi-level config

Every agent, tool, model, and feature is configurable. Settings cascade from project level (`.opencode/opencode-crew.json`) to user level (`~/.config/opencode/opencode-crew.json`) to defaults. Override a single model for one agent, disable a tool entirely, or add a custom task category with your own model mapping.

A minimal project config looks like this:

```json
{
  "agents": {
    "craftsman": {
      "model": "claude-opus-4-5"
    }
  },
  "disabled_tools": ["browser_automation"],
  "categories": {
    "data-analysis": {
      "model": "google/gemini-2.5-pro"
    }
  }
}
```

Project config is committed to your repo so the whole team shares the same agent setup. User config is local and personal, so model credentials stay off version control.

## Community

Questions, feedback, and contributions are welcome in both places:

- [Discord](https://discord.gg/PUwSMR9XNk): ask questions, share what you build, and get help from the community
- [GitHub](https://github.com/OgDev-01/opencode-crew): file issues, contribute skills, or follow the roadmap

## Acknowledgments

OpenCode Crew is built upon the foundation of [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode), an outstanding [OpenCode](https://github.com/anomalyco/opencode) plugin that pioneered the multi-agent orchestration patterns used here. We are grateful for their work and the inspiration it provided.
