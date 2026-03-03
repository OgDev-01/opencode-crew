# src/cli/ — CLI: install, run, doctor, mcp-oauth

**Generated:** 2026-02-24

## OVERVIEW

Commander.js CLI with 5 commands. Entry: `index.ts` → `runCli()` in `cli-program.ts`.

## COMMANDS

| Command | Purpose | Key Logic |
|---------|---------|-----------|
| `install` | Interactive/non-interactive setup | Provider selection → config gen → plugin registration |
| `run <message>` | Non-interactive session launcher | Agent resolution (flag → env → config → Captain) |
| `doctor` | 4-category health checks | System, Config, Tools, Models |
| `get-local-version` | Version detection | Installed vs npm latest |
| `mcp-oauth` | OAuth token management | login (PKCE), logout, status |

## STRUCTURE

```
cli/
├── index.ts                     # Entry point → runCli()
├── cli-program.ts               # Commander.js program (5 commands)
├── install.ts                   # Routes to TUI or CLI installer
├── cli-installer.ts             # Non-interactive (console output)
├── tui-installer.ts             # Interactive (@clack/prompts)
├── model-fallback.ts            # Model config gen by provider availability
├── provider-availability.ts     # Provider detection
├── fallback-chain-resolution.ts # Fallback chain logic
├── config-manager/              # 20 config utilities
│   ├── plugin registration, provider config
│   ├── JSONC operations, auth plugins
│   └── npm dist-tags, binary detection
├── doctor/
│   ├── runner.ts                # Parallel check execution
│   ├── formatter.ts             # Output formatting
│   └── checks/                  # 15 check files in 4 categories
│       ├── system.ts            # Binary, plugin, version
│       ├── config.ts            # JSONC validity, Zod schema
│       ├── tools.ts             # AST-Grep, LSP, GH CLI, MCP
│       └── model-resolution.ts  # Cache, resolution, overrides (6 sub-files)
├── run/                         # Session launcher
│   ├── runner.ts                # Main orchestration
│   ├── agent-resolver.ts        # Flag → env → config → Captain
│   ├── session-resolver.ts      # Create/resume sessions
│   ├── event-handlers.ts        # Event processing
│   └── poll-for-completion.ts   # Wait for todos/background tasks
└── mcp-oauth/                   # OAuth token management
```

## MODEL FALLBACK SYSTEM

Priority: Claude > OpenAI > Gemini > Copilot > OpenCode Zen > Z.ai > Kimi > big-pickle

Agent-specific: archivist→ZAI, lookout→Haiku/nano, craftsman→requires OpenAI/Copilot

## DOCTOR CHECKS

| Category | Validates |
|----------|-----------|
| **System** | Binary found, version >=1.0.150, plugin registered, version match |
| **Config** | JSONC validity, Zod schema, model override syntax |
| **Tools** | AST-Grep, comment-checker, LSP servers, GH CLI, MCP servers |
| **Models** | Cache exists, model resolution, agent/category overrides, availability |

## HOW TO ADD A DOCTOR CHECK

1. Create `src/cli/doctor/checks/{name}.ts`
2. Export check function matching `DoctorCheck` interface
3. Register in `checks/index.ts`
