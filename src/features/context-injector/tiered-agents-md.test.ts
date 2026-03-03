import { describe, it, expect } from "bun:test"
import {
	getCategoryTier,
	parseAgentsMdSections,
	buildTieredAgentsMd,
	type AgentsMdTier,
} from "./tiered-agents-md"
import { estimateTokenCount } from "../memory/token-counter"

const SAMPLE_AGENTS_MD = `# opencode-crew — OpenCode Plugin

**Generated:** 2026-02-24 | **Commit:** fcb90d92 | **Branch:** dev

## OVERVIEW

OpenCode plugin that extends Claude Code with multi-agent orchestration, 46 lifecycle hooks, 26 tools.

## STRUCTURE

\`\`\`
opencode-crew/
├── src/
│   ├── index.ts
│   ├── agents/
│   └── tools/
\`\`\`

## INITIALIZATION FLOW

\`\`\`
OpenCodeCrewPlugin(ctx)
  ├─→ loadPluginConfig()
  └─→ createPluginInterface()
\`\`\`

## 8 OPENCODE HOOK HANDLERS

| Handler | Purpose |
|---------|---------|
| \`config\` | 6-phase config |
| \`tool\` | 26 registered tools |

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add new agent | \`src/agents/\` | Follow createXXXAgent factory pattern |
| Add new tool | \`src/tools/\` | Follow createXXXTool factory |

## MULTI-LEVEL CONFIG

Project → User → Defaults

## THREE-TIER MCP SYSTEM

Built-in, Claude Code, Skill-embedded MCPs.

## CONVENTIONS

- Test pattern: Bun test, co-located *.test.ts
- Factory pattern: createXXX()
- File naming: kebab-case

## ANTI-PATTERNS

- Never use as any
- Never suppress lint/type errors
- Empty catch blocks — always handle errors

## COMMANDS

\`\`\`bash
bun test
bun run build
\`\`\`

## CI/CD

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| ci.yml | push/PR | Tests, typecheck, build |

## NOTES

- Logger writes to /tmp/opencode-crew.log
- Background tasks: 5 concurrent per model/provider`

describe("tiered-agents-md", () => {
	describe("#given getCategoryTier", () => {
		describe("#when called with full-tier categories", () => {
			it("#then returns 'full' for 'deep'", () => {
				expect(getCategoryTier("deep")).toBe("full")
			})

			it("#then returns 'full' for 'ultrabrain'", () => {
				expect(getCategoryTier("ultrabrain")).toBe("full")
			})
		})

		describe("#when called with summary-tier categories", () => {
			it("#then returns 'summary' for 'visual-engineering'", () => {
				expect(getCategoryTier("visual-engineering")).toBe("summary")
			})

			it("#then returns 'minimal' for 'unspecified-high'", () => {
				expect(getCategoryTier("unspecified-high")).toBe("minimal")
			})
		})

		describe("#when called with minimal-tier categories", () => {
			it("#then returns 'minimal' for 'quick'", () => {
				expect(getCategoryTier("quick")).toBe("minimal")
			})

			it("#then returns 'minimal' for 'unspecified-low'", () => {
				expect(getCategoryTier("unspecified-low")).toBe("minimal")
			})

			it("#then returns 'minimal' for 'artistry'", () => {
				expect(getCategoryTier("artistry")).toBe("minimal")
			})

			it("#then returns 'minimal' for 'writing'", () => {
				expect(getCategoryTier("writing")).toBe("minimal")
			})
		})

		describe("#when called with skip-tier categories", () => {
			it("#then returns 'skip' for 'free'", () => {
				expect(getCategoryTier("free")).toBe("skip")
			})
		})

		describe("#when called with undefined or unknown", () => {
			it("#then returns 'minimal' for undefined", () => {
				expect(getCategoryTier(undefined)).toBe("minimal")
			})

			it("#then returns 'minimal' for unknown category", () => {
				expect(getCategoryTier("some-random-category")).toBe("minimal")
			})
		})
	})

	describe("#given parseAgentsMdSections", () => {
		describe("#when parsing content with ## headers", () => {
			it("#then extracts all sections keyed by header name", () => {
				const sections = parseAgentsMdSections(SAMPLE_AGENTS_MD)

				expect(Object.keys(sections)).toContain("OVERVIEW")
				expect(Object.keys(sections)).toContain("STRUCTURE")
				expect(Object.keys(sections)).toContain("CONVENTIONS")
				expect(Object.keys(sections)).toContain("ANTI-PATTERNS")
				expect(Object.keys(sections)).toContain("WHERE TO LOOK")
				expect(Object.keys(sections)).toContain("NOTES")
			})

			it("#then section content starts after the header line", () => {
				const sections = parseAgentsMdSections(SAMPLE_AGENTS_MD)

				expect(sections["OVERVIEW"]).toContain("OpenCode plugin")
				expect(sections["OVERVIEW"]).not.toContain("## OVERVIEW")
			})

			it("#then section content ends before the next ## header", () => {
				const sections = parseAgentsMdSections(SAMPLE_AGENTS_MD)

				expect(sections["OVERVIEW"]).not.toContain("STRUCTURE")
				expect(sections["CONVENTIONS"]).not.toContain("ANTI-PATTERNS")
			})

			it("#then preserves content before first ## as preamble", () => {
				const sections = parseAgentsMdSections(SAMPLE_AGENTS_MD)

				expect(sections["_preamble"]).toContain("opencode-crew")
				expect(sections["_preamble"]).toContain("Generated")
			})
		})

		describe("#when content is empty", () => {
			it("#then returns empty record", () => {
				const sections = parseAgentsMdSections("")
				expect(Object.keys(sections)).toHaveLength(0)
			})
		})

		describe("#when content has no ## headers", () => {
			it("#then returns only preamble", () => {
				const sections = parseAgentsMdSections("Just some text\nWith no headers")
				expect(Object.keys(sections)).toEqual(["_preamble"])
			})
		})
	})

	describe("#given buildTieredAgentsMd", () => {
		describe("#when tier is 'full'", () => {
			it("#then returns the full content unchanged", () => {
				const result = buildTieredAgentsMd(SAMPLE_AGENTS_MD, "full")
				expect(result).toBe(SAMPLE_AGENTS_MD)
			})
		})

		describe("#when tier is 'summary'", () => {
			it("#then includes OVERVIEW section", () => {
				const result = buildTieredAgentsMd(SAMPLE_AGENTS_MD, "summary")
				expect(result).toContain("## OVERVIEW")
				expect(result).toContain("OpenCode plugin")
			})

			it("#then includes CONVENTIONS section", () => {
				const result = buildTieredAgentsMd(SAMPLE_AGENTS_MD, "summary")
				expect(result).toContain("## CONVENTIONS")
			})

			it("#then includes ANTI-PATTERNS section", () => {
				const result = buildTieredAgentsMd(SAMPLE_AGENTS_MD, "summary")
				expect(result).toContain("## ANTI-PATTERNS")
			})

			it("#then includes WHERE TO LOOK section", () => {
				const result = buildTieredAgentsMd(SAMPLE_AGENTS_MD, "summary")
				expect(result).toContain("## WHERE TO LOOK")
			})

			it("#then excludes STRUCTURE section", () => {
				const result = buildTieredAgentsMd(SAMPLE_AGENTS_MD, "summary")
				expect(result).not.toContain("## STRUCTURE")
			})

			it("#then excludes CI/CD section", () => {
				const result = buildTieredAgentsMd(SAMPLE_AGENTS_MD, "summary")
				expect(result).not.toContain("## CI/CD")
			})

			it("#then excludes INITIALIZATION FLOW section", () => {
				const result = buildTieredAgentsMd(SAMPLE_AGENTS_MD, "summary")
				expect(result).not.toContain("## INITIALIZATION FLOW")
			})
		})

		describe("#when tier is 'minimal'", () => {
			it("#then includes CONVENTIONS section", () => {
				const result = buildTieredAgentsMd(SAMPLE_AGENTS_MD, "minimal")
				expect(result).toContain("## CONVENTIONS")
			})

			it("#then includes ANTI-PATTERNS section", () => {
				const result = buildTieredAgentsMd(SAMPLE_AGENTS_MD, "minimal")
				expect(result).toContain("## ANTI-PATTERNS")
			})

			it("#then excludes OVERVIEW section", () => {
				const result = buildTieredAgentsMd(SAMPLE_AGENTS_MD, "minimal")
				expect(result).not.toContain("## OVERVIEW")
			})

			it("#then excludes WHERE TO LOOK section", () => {
				const result = buildTieredAgentsMd(SAMPLE_AGENTS_MD, "minimal")
				expect(result).not.toContain("## WHERE TO LOOK")
			})
		})

		describe("#when tier is 'skip'", () => {
			it("#then returns empty string", () => {
				const result = buildTieredAgentsMd(SAMPLE_AGENTS_MD, "skip")
				expect(result).toBe("")
			})
		})

		describe("#when verifying token savings", () => {
			it("#then summary tier uses ≤50% tokens of full tier", () => {
				const fullTokens = estimateTokenCount(buildTieredAgentsMd(SAMPLE_AGENTS_MD, "full"))
				const summaryTokens = estimateTokenCount(buildTieredAgentsMd(SAMPLE_AGENTS_MD, "summary"))

				expect(summaryTokens).toBeLessThanOrEqual(fullTokens * 0.5)
			})

			it("#then minimal tier uses ≤25% tokens of full tier", () => {
				const fullTokens = estimateTokenCount(buildTieredAgentsMd(SAMPLE_AGENTS_MD, "full"))
				const minimalTokens = estimateTokenCount(buildTieredAgentsMd(SAMPLE_AGENTS_MD, "minimal"))

				expect(minimalTokens).toBeLessThanOrEqual(fullTokens * 0.25)
			})
		})
	})
})
