/// <reference types="bun-types" />

import { describe, it, expect } from "bun:test"
import {
  buildCategorySkillsDelegationGuide,
  buildUltraworkSection,
  buildDeepParallelSection,
  buildNonClaudePlannerSection,
  DynamicAgentPromptBuilder,
  type PromptSection,
  type AvailableSkill,
  type AvailableCategory,
  type AvailableAgent,
} from "./dynamic-agent-prompt-builder"

describe("buildCategorySkillsDelegationGuide", () => {
  const categories: AvailableCategory[] = [
    { name: "visual-engineering", description: "Frontend, UI/UX" },
    { name: "quick", description: "Trivial tasks" },
  ]

  const builtinSkills: AvailableSkill[] = [
    { name: "playwright", description: "Browser automation via Playwright", location: "plugin" },
    { name: "frontend-ui-ux", description: "Designer-turned-developer", location: "plugin" },
  ]

  const customUserSkills: AvailableSkill[] = [
    { name: "react-19", description: "React 19 patterns and best practices", location: "user" },
    { name: "tailwind-4", description: "Tailwind CSS v4 utilities", location: "user" },
  ]

  const customProjectSkills: AvailableSkill[] = [
    { name: "our-design-system", description: "Internal design system components", location: "project" },
  ]

  it("should list builtin and custom skills in compact format", () => {
    //#given: mix of builtin and custom skills
    const allSkills = [...builtinSkills, ...customUserSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: should use compact format with both sections
    expect(result).toContain("**Built-in**: playwright, frontend-ui-ux")
    expect(result).toContain("YOUR SKILLS (PRIORITY)")
    expect(result).toContain("react-19 (user)")
    expect(result).toContain("tailwind-4 (user)")
  })

  it("should point to skill tool as source of truth", () => {
    //#given: skills present
    const allSkills = [...builtinSkills, ...customUserSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: should reference the skill tool for full descriptions
    expect(result).toContain("`skill` tool")
  })

  it("should show source tags for custom skills (user vs project)", () => {
    //#given: both user and project custom skills
    const allSkills = [...builtinSkills, ...customUserSkills, ...customProjectSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: should show source tag for each custom skill
    expect(result).toContain("(user)")
    expect(result).toContain("(project)")
  })

  it("should not show custom skill section when only builtin skills exist", () => {
    //#given: only builtin skills
    const allSkills = [...builtinSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: should not contain custom skill emphasis
    expect(result).not.toContain("YOUR SKILLS")
    expect(result).toContain("**Built-in**:")
    expect(result).toContain("Available Skills")
  })

  it("should handle only custom skills (no builtins)", () => {
    //#given: only custom skills, no builtins
    const allSkills = [...customUserSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: should show custom skills with emphasis, no builtin line
    expect(result).toContain("YOUR SKILLS (PRIORITY)")
    expect(result).not.toContain("**Built-in**:")
  })

  it("should include priority note for custom skills in evaluation step", () => {
    //#given: custom skills present
    const allSkills = [...builtinSkills, ...customUserSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: evaluation section should mention user-installed priority
    expect(result).toContain("User-installed skills get PRIORITY")
    expect(result).toContain("INCLUDE rather than omit")
  })

  it("should NOT include priority note when no custom skills", () => {
    //#given: only builtin skills
    const allSkills = [...builtinSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: no priority note for custom skills
    expect(result).not.toContain("User-installed skills get PRIORITY")
  })

  it("should return empty string when no categories and no skills", () => {
    //#given: no categories and no skills
    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide([], [])

    //#then: should return empty string
    expect(result).toBe("")
  })

  it("should include category descriptions", () => {
    //#given: categories with descriptions
    const allSkills = [...builtinSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: should list categories with their descriptions
    expect(result).toContain("`visual-engineering`")
    expect(result).toContain("Frontend, UI/UX")
    expect(result).toContain("`quick`")
    expect(result).toContain("Trivial tasks")
  })
})

describe("buildUltraworkSection", () => {
  const agents: AvailableAgent[] = []

  it("should separate builtin and custom skills", () => {
    //#given: mix of builtin and custom skills
    const skills: AvailableSkill[] = [
      { name: "playwright", description: "Browser automation", location: "plugin" },
      { name: "react-19", description: "React 19 patterns", location: "user" },
    ]

    //#when: building ultrawork section
    const result = buildUltraworkSection(agents, [], skills)

    //#then: should have separate sections
    expect(result).toContain("Built-in Skills")
    expect(result).toContain("User-Installed Skills")
    expect(result).toContain("HIGH PRIORITY")
  })

  it("should not separate when only builtin skills", () => {
    //#given: only builtin skills
    const skills: AvailableSkill[] = [
      { name: "playwright", description: "Browser automation", location: "plugin" },
    ]

    //#when: building ultrawork section
    const result = buildUltraworkSection(agents, [], skills)

    //#then: should have single section
    expect(result).toContain("Built-in Skills")
    expect(result).not.toContain("User-Installed Skills")
  })
})

describe("buildDeepParallelSection", () => {
  const deepCategory: AvailableCategory = { name: "deep", description: "Autonomous problem-solving" }
  const otherCategory: AvailableCategory = { name: "quick", description: "Trivial tasks" }

  it("#given non-Claude model with deep category #when building #then returns parallel delegation section", () => {
    //#given
    const model = "google/gemini-3-pro"
    const categories = [deepCategory, otherCategory]

    //#when
    const result = buildDeepParallelSection(model, categories)

    //#then
    expect(result).toContain("Deep Parallel Delegation")
    expect(result).toContain("EVERY independent unit")
    expect(result).toContain("run_in_background=true")
    expect(result).toContain("4 independent units")
  })

  it("#given Claude model #when building #then returns empty", () => {
    //#given
    const model = "anthropic/claude-opus-4-6"
    const categories = [deepCategory]

    //#when
    const result = buildDeepParallelSection(model, categories)

    //#then
    expect(result).toBe("")
  })

  it("#given non-Claude model without deep category #when building #then returns empty", () => {
    //#given
    const model = "openai/gpt-5.2"
    const categories = [otherCategory]

    //#when
    const result = buildDeepParallelSection(model, categories)

    //#then
    expect(result).toBe("")
  })
})

describe("buildNonClaudePlannerSection", () => {
  it("#given non-Claude model #when building #then returns plan agent section", () => {
    //#given
    const model = "google/gemini-3-pro"

    //#when
    const result = buildNonClaudePlannerSection(model)

    //#then
    expect(result).toContain("Plan Agent")
    expect(result).toContain("session_id")
    expect(result).toContain("Multi-step")
  })

  it("#given Claude model #when building #then returns empty", () => {
    //#given
    const model = "anthropic/claude-sonnet-4-6"

    //#when
    const result = buildNonClaudePlannerSection(model)

    //#then
    expect(result).toBe("")
  })

  it("#given GPT model #when building #then returns plan agent section", () => {
    //#given
    const model = "openai/gpt-5.2"

    //#when
    const result = buildNonClaudePlannerSection(model)

    //#then
    expect(result).toContain("Plan Agent")
    expect(result).not.toBe("")
  })
})

describe("DynamicAgentPromptBuilder", () => {
  const sections: PromptSection[] = [
    { id: "identity", content: "Core identity block", priority: "P0", tags: ["core"] },
    { id: "task", content: "Current task description", priority: "P0", tags: ["task"] },
    { id: "must", content: "Must-have constraints", priority: "P0", tags: ["constraints"] },
    { id: "tooling", content: "Tool usage patterns and guardrails", priority: "P1", tags: ["tooling"] },
    { id: "git", content: "Git workflow and commit process", priority: "P1", tags: ["git"] },
    { id: "architecture", content: "Architecture rationale and service boundaries", priority: "P2", tags: ["architecture"] },
    { id: "ui", content: "UI patterns and design references", priority: "P2", tags: ["ui-patterns", "design-ref"] },
    { id: "examples", content: "Detailed examples and edge cases", priority: "P3", tags: ["examples"] },
  ]

  describe("#given category-aware sizing", () => {
    describe("#when category is visual-engineering", () => {
      it("#then strips git and architecture but keeps ui-oriented sections", () => {
        const builder = new DynamicAgentPromptBuilder({ sections })

        const prompt = builder.buildWithSizing("visual-engineering", 0.2, 0, 2000)

        expect(prompt).not.toContain("Git workflow and commit process")
        expect(prompt).not.toContain("Architecture rationale and service boundaries")
        expect(prompt).toContain("UI patterns and design references")
      })
    })

    describe("#when category is quick", () => {
      it("#then keeps only P0 sections", () => {
        const builder = new DynamicAgentPromptBuilder({ sections })

        const prompt = builder.buildWithSizing("quick", 0.1, 0, 2000)

        expect(prompt).toContain("Core identity block")
        expect(prompt).toContain("Current task description")
        expect(prompt).toContain("Must-have constraints")
        expect(prompt).not.toContain("Tool usage patterns and guardrails")
        expect(prompt).not.toContain("Detailed examples and edge cases")
      })
    })
  })

    describe("#when category is artistry", () => {
      it("#then no sections are stripped (creative tasks need full context)", () => {
        const builder = new DynamicAgentPromptBuilder({ sections })

        const prompt = builder.buildWithSizing("artistry", 0.2, 0, 2000)

        expect(prompt).toContain("Core identity block")
        expect(prompt).toContain("Tool usage patterns and guardrails")
        expect(prompt).toContain("Git workflow and commit process")
        expect(prompt).toContain("Architecture rationale and service boundaries")
        expect(prompt).toContain("UI patterns and design references")
        expect(prompt).toContain("Detailed examples and edge cases")
      })
    })

    describe("#when category is deep", () => {
      it("#then no sections are stripped (autonomous tasks need full context)", () => {
        const builder = new DynamicAgentPromptBuilder({ sections })

        const prompt = builder.buildWithSizing("deep", 0.2, 0, 2000)

        expect(prompt).toContain("Core identity block")
        expect(prompt).toContain("Tool usage patterns and guardrails")
        expect(prompt).toContain("Git workflow and commit process")
        expect(prompt).toContain("Architecture rationale and service boundaries")
        expect(prompt).toContain("UI patterns and design references")
        expect(prompt).toContain("Detailed examples and edge cases")
      })
    })

    describe("#when category is writing", () => {
      it("#then git, architecture, and debugging sections are stripped", () => {
        const extendedSections: PromptSection[] = [
          ...sections,
          { id: "debugging", content: "Debugging strategies and tools", priority: "P1", tags: ["debugging"] },
        ]
        const builder = new DynamicAgentPromptBuilder({ sections: extendedSections })

        const prompt = builder.buildWithSizing("writing", 0.2, 0, 2000)

        expect(prompt).toContain("Core identity block")
        expect(prompt).toContain("Tool usage patterns and guardrails")
        expect(prompt).toContain("UI patterns and design references")
        expect(prompt).not.toContain("Git workflow and commit process")
        expect(prompt).not.toContain("Architecture rationale and service boundaries")
        expect(prompt).not.toContain("Debugging strategies and tools")
      })
    })

    describe("#when category is free", () => {
      it("#then maximum sections are stripped (background tasks need minimal prompt)", () => {
        const extendedSections: PromptSection[] = [
          ...sections,
          { id: "debugging", content: "Debugging strategies and tools", priority: "P1", tags: ["debugging"] },
          { id: "testing", content: "Testing patterns and coverage", priority: "P2", tags: ["testing"] },
        ]
        const builder = new DynamicAgentPromptBuilder({ sections: extendedSections })

        const prompt = builder.buildWithSizing("free", 0.2, 0, 2000)

        expect(prompt).toContain("Core identity block")
        expect(prompt).toContain("Tool usage patterns and guardrails")
        expect(prompt).not.toContain("Git workflow and commit process")
        expect(prompt).not.toContain("Architecture rationale and service boundaries")
        expect(prompt).not.toContain("Debugging strategies and tools")
        expect(prompt).not.toContain("UI patterns and design references")
        expect(prompt).not.toContain("Testing patterns and coverage")
        expect(prompt).not.toContain("Detailed examples and edge cases")
      })
    })

    describe("#when category is quick (regression)", () => {
      it("#then only P0 sections remain and all non-P0 are stripped", () => {
        const builder = new DynamicAgentPromptBuilder({ sections })

        const prompt = builder.buildWithSizing("quick", 0.2, 0, 2000)

        expect(prompt).toContain("Core identity block")
        expect(prompt).toContain("Current task description")
        expect(prompt).toContain("Must-have constraints")
        expect(prompt).not.toContain("Tool usage patterns and guardrails")
        expect(prompt).not.toContain("Git workflow and commit process")
        expect(prompt).not.toContain("Architecture rationale and service boundaries")
        expect(prompt).not.toContain("UI patterns and design references")
        expect(prompt).not.toContain("Detailed examples and edge cases")
      })
    })

  describe("#given progressive reduction", () => {
    it("#when pressure is moderate (>50%) #then strips only P3", () => {
      const builder = new DynamicAgentPromptBuilder({ sections })

      const prompt = builder.buildWithSizing("deep", 0.51, 0, 2000)

      expect(prompt).toContain("Tool usage patterns and guardrails")
      expect(prompt).toContain("Architecture rationale and service boundaries")
      expect(prompt).not.toContain("Detailed examples and edge cases")
    })

    it("#when pressure is high (>70%) #then strips P2 and P3", () => {
      const builder = new DynamicAgentPromptBuilder({ sections })

      const prompt = builder.buildWithSizing("deep", 0.71, 0, 2000)

      expect(prompt).toContain("Tool usage patterns and guardrails")
      expect(prompt).not.toContain("Architecture rationale and service boundaries")
      expect(prompt).not.toContain("Detailed examples and edge cases")
    })

    it("#when pressure is critical (>85%) #then strips P1/P2/P3 but never P0", () => {
      const builder = new DynamicAgentPromptBuilder({ sections })

      const prompt = builder.buildWithSizing("deep", 0.86, 0, 2000)

      expect(prompt).toContain("Core identity block")
      expect(prompt).toContain("Current task description")
      expect(prompt).toContain("Must-have constraints")
      expect(prompt).not.toContain("Tool usage patterns and guardrails")
      expect(prompt).not.toContain("Architecture rationale and service boundaries")
      expect(prompt).not.toContain("Detailed examples and edge cases")
    })
  })

  describe("#given token budget with memory injection", () => {
    it("#when memory tokens increase #then prompt budget shrinks before section sizing", () => {
      const budgetSections: PromptSection[] = [
        { id: "identity", content: "core-identity", priority: "P0", tags: ["core"] },
        { id: "task", content: "task-goal", priority: "P0", tags: ["task"] },
        { id: "tooling", content: "tooling-guidance-include-me", priority: "P1", tags: ["tooling"] },
      ]
      const builder = new DynamicAgentPromptBuilder({ sections: budgetSections })

      const noMemoryPrompt = builder.buildWithSizing("deep", 0.2, 0, 48)
      const memoryPrompt = builder.buildWithSizing("deep", 0.2, 5, 48)

      expect(noMemoryPrompt).toContain("tooling-guidance-include-me")
      expect(memoryPrompt).not.toContain("tooling-guidance-include-me")
      expect(memoryPrompt).toContain("core-identity")
      expect(memoryPrompt).toContain("task-goal")
    })
  })
})
