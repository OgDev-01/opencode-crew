import { describe, it, expect } from "bun:test"
import { estimateTokenCount, measurePromptTokens } from "../token-counter"
import { DynamicAgentPromptBuilder } from "../../../agents/dynamic-agent-prompt-builder"
import type { PromptSection } from "../../../agents/dynamic-agent-prompt-builder"
import { buildTieredAgentsMd } from "../../context-injector/tiered-agents-md"
import { buildSystemContent } from "../../../tools/delegate-task/prompt-builder"
import { shouldDelegateOrInline } from "../../../tools/delegate-task/cost-heuristic"

function logBenchmark(scenario: string, detail: string) {
	console.log(`[token-benchmark] ${scenario}: ${detail}`)
}

function pct(saved: number, total: number): string {
	return `${((saved / total) * 100).toFixed(1)}%`
}

const FAKE_AGENTS_MD = [
	"# Project — My Application",
	"",
	"## OVERVIEW",
	"This is a large TypeScript monorepo with 500+ files across 12 modules.",
	"It uses React for frontend, Express for backend, and PostgreSQL for data.",
	"The architecture follows clean architecture with hexagonal port/adapter pattern.",
	"Key modules: auth, billing, notifications, analytics, admin, api-gateway.",
	"",
	"## STRUCTURE",
	"```",
	"src/",
	"  auth/         # JWT + OAuth2 + MFA",
	"  billing/      # Stripe integration + invoicing",
	"  notifications/ # Email + push + SMS",
	"  analytics/    # Event tracking + dashboards",
	"  admin/        # Admin panel + RBAC",
	"  api-gateway/  # Rate limiting + routing",
	"  shared/       # Common utilities + types",
	"  config/       # Environment + feature flags",
	"  db/           # Migrations + seeds + queries",
	"  middleware/   # Auth + logging + error handling",
	"```",
	"",
	"## CONVENTIONS",
	"- Factory pattern for all services",
	"- Dependency injection via constructor",
	"- Tests co-located with source files",
	"- kebab-case file naming",
	"- Barrel exports via index.ts",
	"",
	"## ANTI-PATTERNS",
	"- Never use `any` type assertions",
	"- Never commit secrets or env files",
	"- Never write catch-all utility files",
	"- Never skip error handling in async code",
	"",
	"## WHERE TO LOOK",
	"| Task | Location |",
	"|------|----------|",
	"| Add API endpoint | src/api-gateway/ |",
	"| Add DB migration | src/db/migrations/ |",
	"| Add auth flow | src/auth/ |",
	"| Add billing feature | src/billing/ |",
	"",
	"## NOTES",
	"- Uses pnpm workspaces for monorepo management",
	"- CI runs on GitHub Actions with matrix builds",
	"- Staging deploys automatically on PR merge to develop",
	"- Production deploys require manual approval",
	"- Database migrations run automatically on deploy",
	"- Feature flags managed via LaunchDarkly integration",
	"- Monitoring via Datadog with custom dashboards",
	"- Error tracking via Sentry with source maps",
	"- API documentation auto-generated via OpenAPI spec",
	"- Load testing runs weekly via k6 scripts in ci/",
].join("\n")

const SAMPLE_SECTIONS: PromptSection[] = [
	{ id: "role", content: "You are Captain, the main orchestrator agent.", priority: "P0" },
	{ id: "tools", content: "Available tools: read, write, edit, bash, grep, glob, lsp_*, ast_grep_*. Use the right tool for the job.", priority: "P0" },
	{ id: "delegation", content: "Delegate complex tasks to specialized agents. Use lookout for codebase search, archivist for docs, sage for architecture decisions. Run background tasks in parallel when independent.", priority: "P1" },
	{ id: "anti-patterns", content: "Never use `as any`. Never suppress errors. Never commit without request. Never speculate about unread code. Never leave code broken.", priority: "P1" },
	{ id: "git-workflow", content: "Follow atomic commits. Use conventional commit messages. Always verify before claiming completion. Run tests before committing. Check git status and diff before creating commits.", priority: "P2", tags: ["git"] },
	{ id: "architecture", content: "This project uses hexagonal architecture with ports and adapters. Services communicate via event bus. Database access through repository pattern. All external dependencies behind interfaces.", priority: "P2", tags: ["architecture"] },
	{ id: "ui-patterns", content: "Use compound components for complex UI. Follow WAI-ARIA for accessibility. Use CSS modules for styling. Implement loading and error states for all async operations. Use React.lazy for code splitting.", priority: "P3", tags: ["ui", "ui-patterns"] },
	{ id: "examples", content: "Example test: describe('#given valid input', () => { it('returns expected output', () => { ... }) }). Example commit: feat(auth): add MFA support for TOTP tokens.", priority: "P3", tags: ["examples"] },
]

describe("token-benchmark", () => {
	describe("#given optimization features from Waves 1-4", () => {
		describe("#when measuring token savings", () => {
			describe("#then", () => {
				it("Scenario A: system prompt savings per category", () => {
					const builder = new DynamicAgentPromptBuilder({ sections: SAMPLE_SECTIONS })

					const deepPrompt = builder.buildWithSizing("deep", 0)
					const quickPrompt = builder.buildWithSizing("quick", 0)
					const deepTokens = estimateTokenCount(deepPrompt)
					const quickTokens = estimateTokenCount(quickPrompt)
					const savings = deepTokens - quickTokens
					const ratio = quickTokens / deepTokens

					logBenchmark("Scenario A", `quick=${quickTokens} tokens, deep=${deepTokens} tokens, savings=${savings} (${pct(savings, deepTokens)})`)

					expect(quickTokens).toBeLessThan(deepTokens)
					expect(quickPrompt.length).toBeGreaterThan(0)

					if (ratio > 0.7) {
						console.warn(`[token-benchmark] WARNING: Scenario A savings below 30% target (ratio=${ratio.toFixed(3)})`)
					}
				})

				it("Scenario B: tool description savings per category", () => {
					const largeAgentsContext = FAKE_AGENTS_MD
					const skillBlock = "You are a specialized agent with deep knowledge of TypeScript, React, and Node.js. Follow test-driven development strictly. Write failing tests first, then implement minimal code to pass. Refactor after green. Use dependency injection for testability. Prefer composition over inheritance. Keep functions pure where possible. Handle all error paths explicitly. Document public APIs with JSDoc. Use conventional commits for all changes. Run the full test suite before pushing."
					const skillContents = Array.from({ length: 5 }, (_, i) =>
						`## Skill ${i + 1}\n${skillBlock}\nAdditional context for skill ${i + 1}: ${'x'.repeat(800)}`
					)

					const quickResult = buildSystemContent({
						category: "quick",
						loadedSkills: [],
						agentsContext: largeAgentsContext,
						skillContents,
						maxPromptTokens: 1200,
					})
					const fullResult = buildSystemContent({
						agentsContext: largeAgentsContext,
						skillContents,
					})

					const quickTokens = estimateTokenCount(quickResult ?? "")
					const fullTokens = estimateTokenCount(fullResult ?? "")
					const savings = fullTokens - quickTokens

					logBenchmark("Scenario B", `quick=${quickTokens} tokens, full=${fullTokens} tokens, savings=${savings} (${pct(savings, fullTokens)})`)

					expect(quickTokens).toBeLessThan(fullTokens)

					if (savings < 1500) {
						console.warn(`[token-benchmark] WARNING: Scenario B savings below 1500 token target (savings=${savings})`)
					}
				})

				it("Scenario C: AGENTS.md tiering savings", () => {
					const fullContent = buildTieredAgentsMd(FAKE_AGENTS_MD, "full")
					const summaryContent = buildTieredAgentsMd(FAKE_AGENTS_MD, "summary")
					const minimalContent = buildTieredAgentsMd(FAKE_AGENTS_MD, "minimal")

					const fullTokens = estimateTokenCount(fullContent)
					const summaryTokens = estimateTokenCount(summaryContent)
					const minimalTokens = estimateTokenCount(minimalContent)

					const summaryRatio = summaryTokens / fullTokens
					const minimalRatio = minimalTokens / fullTokens

					logBenchmark("Scenario C", [
						`full=${fullTokens} tokens`,
						`summary=${summaryTokens} tokens (${pct(fullTokens - summaryTokens, fullTokens)} saved)`,
						`minimal=${minimalTokens} tokens (${pct(fullTokens - minimalTokens, fullTokens)} saved)`,
					].join(", "))

					expect(summaryTokens).toBeLessThan(fullTokens)
					expect(minimalTokens).toBeLessThan(summaryTokens)

					if (summaryRatio > 0.6) {
						console.warn(`[token-benchmark] WARNING: Scenario C summary ratio above 60% target (ratio=${summaryRatio.toFixed(3)})`)
					}
					if (minimalRatio > 0.35) {
						console.warn(`[token-benchmark] WARNING: Scenario C minimal ratio above 35% target (ratio=${minimalRatio.toFixed(3)})`)
					}
				})

				it("Scenario D: heartbeat pruner token savings", () => {
					const toolResults = [
						{ role: "assistant", content: "I'll read the file." },
						{ role: "tool", content: "1: import { foo } from 'bar'\n2: \n3: export function hello() {\n4:   return 'world'\n5: }" },
						{ role: "assistant", content: "Now let me check the tests." },
						{ role: "tool", content: "ok" },
						{ role: "assistant", content: "Running the build." },
						{ role: "tool", content: "Build succeeded. 0 errors, 0 warnings." },
						{ role: "assistant", content: "Let me check git status." },
						{ role: "tool", content: "On branch main\nnothing to commit, working tree clean" },
						{ role: "assistant", content: "Checking linter output." },
						{ role: "tool", content: "All files pass linting." },
						{ role: "assistant", content: "Running tests." },
						{ role: "tool", content: "PASS\n\nTest Suites: 1 passed, 1 total\nTests: 5 passed, 5 total" },
						{ role: "assistant", content: "Let me verify the types." },
						{ role: "tool", content: "No errors found." },
						{ role: "assistant", content: "Checking for unused imports." },
						{ role: "tool", content: "ok" },
						{ role: "assistant", content: "Reading another file." },
						{ role: "tool", content: "1: const config = {\n2:   port: 3000,\n3:   host: 'localhost'\n4: }" },
						{ role: "assistant", content: "Final verification." },
						{ role: "tool", content: "ok" },
					]

					const zeroInfoPatterns = [/^ok$/i, /^no errors/i, /^all files pass/i, /^build succeeded/i, /nothing to commit/]

					const prunedMessages = toolResults.filter((msg) => {
						if (msg.role !== "tool") return true
						return !zeroInfoPatterns.some((pattern) => pattern.test(msg.content.trim()))
					})

					const beforeTokens = measurePromptTokens(toolResults)
					const afterTokens = measurePromptTokens(prunedMessages)
					const savings = beforeTokens - afterTokens
					const savingsRatio = savings / beforeTokens

					logBenchmark("Scenario D", `before=${beforeTokens} tokens, after=${afterTokens} tokens, savings=${savings} (${pct(savings, beforeTokens)})`)

					expect(afterTokens).toBeLessThan(beforeTokens)

					if (savingsRatio < 0.1) {
						console.warn(`[token-benchmark] WARNING: Scenario D savings below 10% target (ratio=${savingsRatio.toFixed(3)})`)
					}
				})

				it("Scenario E: delegation heuristic inline rate", () => {
					const testCases: Array<{ category: string; prompt: string; fileCount?: number }> = [
						{ category: "quick", prompt: "fix typo in README", fileCount: 1 },
						{ category: "quick", prompt: "add a comment", fileCount: 1 },
						{ category: "quick", prompt: "rename variable x to count" },
						{ category: "deep", prompt: "refactor the entire auth module to use JWT", fileCount: 5 },
						{ category: "deep", prompt: "implement websocket support", fileCount: 4 },
						{ category: "ultrabrain", prompt: "design the caching architecture", fileCount: 3 },
						{ category: "visual-engineering", prompt: "build the dashboard page", fileCount: 6 },
						{ category: "quick", prompt: "update version number in package.json", fileCount: 1 },
						{ category: "unspecified-low", prompt: "add a small helper function", fileCount: 1 },
						{ category: "unspecified-high", prompt: "migrate database schema and update all queries across the project", fileCount: 8 },
					]

					let inlineCount = 0
					const results: string[] = []

					for (const tc of testCases) {
						const result = shouldDelegateOrInline(tc)
						if (result.decision === "suggest-inline") inlineCount++
						results.push(`  ${tc.category}/${tc.fileCount ?? 1}f → ${result.decision}`)
					}

					const inlineRate = inlineCount / testCases.length

					logBenchmark("Scenario E", `inline=${inlineCount}/${testCases.length} (${pct(inlineCount, testCases.length)})\n${results.join("\n")}`)

					expect(inlineCount).toBeGreaterThanOrEqual(1)

					if (inlineRate < 0.2) {
						console.warn(`[token-benchmark] WARNING: Scenario E inline rate below 20% target (rate=${inlineRate.toFixed(3)})`)
					}
				})
			})
		})
	})
})
