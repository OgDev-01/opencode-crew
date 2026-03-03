declare const require: (name: string) => unknown
const { describe, test, expect } = require("bun:test") as {
  describe: (name: string, fn: () => void) => void
  test: (name: string, fn: () => void) => void
  expect: (value: unknown) => {
    toBe: (expected: unknown) => void
    toContain: (expected: string) => void
    not: {
      toContain: (expected: string) => void
    }
    toBeDefined: () => void
    toBeUndefined: () => void
    toBeGreaterThanOrEqual: (expected: number) => void
    toBeLessThanOrEqual: (expected: number) => void
  }
}

import { buildSystemContent } from "./prompt-builder"
import { getToolsForCategory } from "./prompt-builder"
import { estimateTokenCount } from "../../features/memory/token-counter"

describe("prompt-builder", () => {
  describe("#given buildSystemContent", () => {
    describe("#when called without category", () => {
      test("#then returns system content without tool guidance", () => {
        const result = buildSystemContent({
          skillContent: "some skill",
          categoryPromptAppend: "category context",
        })

        expect(result).toBeDefined()
        expect(result).not.toContain("<Tool_Guidance>")
      })
    })

    describe("#when called with category=quick", () => {
      test("#then injects tool guidance with only 4 tools", () => {
        const result = buildSystemContent({
          skillContent: "some skill",
          categoryPromptAppend: "category context",
          category: "quick",
        })

        expect(result).toBeDefined()
        expect(result).toContain("<Tool_Guidance>")
        expect(result).toContain("edit")
        expect(result).toContain("write")
        expect(result).toContain("read")
        expect(result).toContain("bash")
        expect(result).not.toContain("lsp_diagnostics")
        expect(result).not.toContain("ast_grep_search")
        expect(result).not.toContain("mgrep")
      })
    })

    describe("#when called with category=deep", () => {
      test("#then does not inject tool guidance (all tools available)", () => {
        const result = buildSystemContent({
          skillContent: "some skill",
          categoryPromptAppend: "category context",
          category: "deep",
        })

        expect(result).toBeDefined()
        expect(result).not.toContain("<Tool_Guidance>")
      })
    })

    describe("#when called with category=ultrabrain", () => {
      test("#then injects tool guidance with analysis-focused tools", () => {
        const result = buildSystemContent({
          skillContent: "some skill",
          categoryPromptAppend: "category context",
          category: "ultrabrain",
        })

        expect(result).toBeDefined()
        expect(result).toContain("<Tool_Guidance>")
        expect(result).toContain("read")
        expect(result).toContain("grep")
        expect(result).toContain("mgrep")
        expect(result).toContain("lsp_diagnostics")
        expect(result).toContain("lsp_find_references")
        expect(result).toContain("ast_grep_search")
        expect(result).toContain("ast_grep_replace")
      })
    })

    describe("#when called with category=visual-engineering", () => {
      test("#then injects tool guidance with UI-focused tools", () => {
        const result = buildSystemContent({
          skillContent: "some skill",
          categoryPromptAppend: "category context",
          category: "visual-engineering",
        })

        expect(result).toBeDefined()
        expect(result).toContain("<Tool_Guidance>")
        expect(result).toContain("edit")
        expect(result).toContain("write")
        expect(result).toContain("read")
        expect(result).toContain("glob")
        expect(result).toContain("bash")
        expect(result).toContain("lsp_diagnostics")
      })
    })

    describe("#when called with quick category and playwright skill loaded", () => {
      test("#then adds browser tools to quick category", () => {
        const result = buildSystemContent({
          skillContent: "some skill",
          categoryPromptAppend: "category context",
          category: "quick",
          loadedSkills: ["playwright"],
        })

        expect(result).toBeDefined()
        expect(result).toContain("<Tool_Guidance>")
        expect(result).toContain("edit")
        expect(result).toContain("write")
        expect(result).toContain("read")
        expect(result).toContain("bash")
        expect(result).toContain("skill_mcp")
      })
    })

    describe("#when called with dev-browser skill loaded", () => {
      test("#then adds browser tools to the injection set", () => {
        const result = buildSystemContent({
          skillContent: "some skill",
          categoryPromptAppend: "category context",
          category: "visual-engineering",
          loadedSkills: ["dev-browser"],
        })

        expect(result).toBeDefined()
        expect(result).toContain("skill_mcp")
      })
    })

    describe("#when called without category (backward compatible)", () => {
      test("#then existing behavior is preserved", () => {
        const resultWithoutCategory = buildSystemContent({
          skillContent: "some skill",
          categoryPromptAppend: "category context",
          agentsContext: "agents context here",
        })

        expect(resultWithoutCategory).toBeDefined()
        expect(resultWithoutCategory).toContain("some skill")
        expect(resultWithoutCategory).toContain("category context")
        expect(resultWithoutCategory).toContain("agents context here")
      })
    })
  })

  describe("#given getToolsForCategory", () => {
    describe("#when category is quick", () => {
      test("#then returns exactly 4 tools", () => {
        const tools = getToolsForCategory("quick")
        expect(tools.length).toBe(4)
      })
    })

    describe("#when category is deep", () => {
      test("#then returns undefined (no filtering)", () => {
        const tools = getToolsForCategory("deep")
        expect(tools).toBeUndefined()
      })
    })

    describe("#when category is ultrabrain", () => {
      test("#then returns analysis-focused tools", () => {
        const tools = getToolsForCategory("ultrabrain")
        expect(tools).toBeDefined()
        expect(tools).toContain("read")
        expect(tools).toContain("lsp_diagnostics")
        expect(tools).toContain("ast_grep_search")
      })
    })

    describe("#when category is unknown", () => {
      test("#then returns undefined (no filtering, same as deep)", () => {
        const tools = getToolsForCategory("custom-category")
        expect(tools).toBeUndefined()
      })
    })

    describe("#when loadedSkills includes playwright", () => {
      test("#then browser tools are added", () => {
        const tools = getToolsForCategory("quick", ["playwright"])
        expect(tools).toBeDefined()
        expect(tools).toContain("edit")
        expect(tools).toContain("skill_mcp")
      })
    })
  })

  describe("#given token savings measurement", () => {
    describe("#when quick category tool count is compared to all tools", () => {
      test("#then quick injects at most 4 tools vs 26+ total", () => {
        const quickTools = getToolsForCategory("quick")
        expect(quickTools).toBeDefined()
        expect(quickTools!.length).toBeLessThanOrEqual(4)

        const deepTools = getToolsForCategory("deep")
        expect(deepTools).toBeUndefined()
      })

      test("#then tool guidance text for quick is compact", () => {
        const result = buildSystemContent({
          skillContent: "some skill content for testing",
          categoryPromptAppend: "category context",
          category: "quick",
        })

        const guidanceMatch = (result ?? "").match(/<Tool_Guidance>[\s\S]*?<\/Tool_Guidance>/)
        expect(guidanceMatch).toBeDefined()
        const guidanceTokens = estimateTokenCount(guidanceMatch![0])
        expect(guidanceTokens).toBeLessThanOrEqual(50)
      })
    })

    describe("#when tool filtering savings are projected", () => {
      test("#then quick category saves at least 1500 tokens in tool descriptions", () => {
        const avgToolDescriptionTokens = 100
        const totalToolCount = 26
        const quickTools = getToolsForCategory("quick")
        const quickToolCount = quickTools!.length
        const filteredOutCount = totalToolCount - quickToolCount
        const projectedSavings = filteredOutCount * avgToolDescriptionTokens
        expect(projectedSavings).toBeGreaterThanOrEqual(1500)
      })
    })
  })
})
