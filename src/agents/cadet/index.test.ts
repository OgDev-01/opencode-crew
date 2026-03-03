import { describe, expect, test } from "bun:test"
import {
  createCadetAgentWithOverrides,
  CADET_DEFAULTS,
  getCadetPromptSource,
  buildCadetPrompt,
} from "./index"

describe("createCadetAgentWithOverrides", () => {
  describe("honored fields", () => {
    test("applies model override", () => {
      // given
      const override = { model: "openai/gpt-5.2" }

      // when
      const result = createCadetAgentWithOverrides(override)

      // then
      expect(result.model).toBe("openai/gpt-5.2")
    })

    test("applies temperature override", () => {
      // given
      const override = { temperature: 0.5 }

      // when
      const result = createCadetAgentWithOverrides(override)

      // then
      expect(result.temperature).toBe(0.5)
    })

    test("applies top_p override", () => {
      // given
      const override = { top_p: 0.9 }

      // when
      const result = createCadetAgentWithOverrides(override)

      // then
      expect(result.top_p).toBe(0.9)
    })

    test("applies description override", () => {
      // given
      const override = { description: "Custom description" }

      // when
      const result = createCadetAgentWithOverrides(override)

      // then
      expect(result.description).toBe("Custom description")
    })

    test("applies color override", () => {
      // given
      const override = { color: "#FF0000" }

      // when
      const result = createCadetAgentWithOverrides(override)

      // then
      expect(result.color).toBe("#FF0000")
    })

    test("appends prompt_append to base prompt", () => {
      // given
      const override = { prompt_append: "Extra instructions here" }

      // when
      const result = createCadetAgentWithOverrides(override)

      // then
      expect(result.prompt).toContain("Cadet")
      expect(result.prompt).toContain("Extra instructions here")
    })
  })

  describe("defaults", () => {
    test("uses default model when no override", () => {
      // given
      const override = {}

      // when
      const result = createCadetAgentWithOverrides(override)

      // then
      expect(result.model).toBe(CADET_DEFAULTS.model)
    })

    test("uses default temperature when no override", () => {
      // given
      const override = {}

      // when
      const result = createCadetAgentWithOverrides(override)

      // then
      expect(result.temperature).toBe(CADET_DEFAULTS.temperature)
    })
  })

  describe("disable semantics", () => {
    test("disable: true causes override block to be ignored", () => {
      // given
      const override = {
        disable: true,
        model: "openai/gpt-5.2",
        temperature: 0.9,
      }

      // when
      const result = createCadetAgentWithOverrides(override)

      // then - defaults should be used, not the overrides
      expect(result.model).toBe(CADET_DEFAULTS.model)
      expect(result.temperature).toBe(CADET_DEFAULTS.temperature)
    })
  })

  describe("constrained fields", () => {
    test("mode is forced to subagent", () => {
      // given
      const override = { mode: "primary" as const }

      // when
      const result = createCadetAgentWithOverrides(override)

      // then
      expect(result.mode).toBe("subagent")
    })

    test("prompt override is ignored (discipline text preserved)", () => {
      // given
      const override = { prompt: "Completely new prompt that replaces everything" }

      // when
      const result = createCadetAgentWithOverrides(override)

      // then
      expect(result.prompt).toContain("Cadet")
      expect(result.prompt).not.toBe("Completely new prompt that replaces everything")
    })
  })

  describe("tool safety (task blocked, call_agent allowed)", () => {
    test("task remains blocked, call_agent is allowed via tools format", () => {
      // given
      const override = {
        tools: {
          task: true,
          call_agent: true,
          read: true,
        },
      }

      // when
      const result = createCadetAgentWithOverrides(override)

      // then
      const tools = result.tools as Record<string, boolean> | undefined
      const permission = result.permission as Record<string, string> | undefined
      if (tools) {
        expect(tools.task).toBe(false)
        // call_agent is NOW ALLOWED for subagents to spawn lookout/archivist
        expect(tools.call_agent).toBe(true)
        expect(tools.read).toBe(true)
      }
      if (permission) {
        expect(permission.task).toBe("deny")
        // call_agent is NOW ALLOWED for subagents to spawn lookout/archivist
        expect(permission.call_agent).toBe("allow")
      }
    })

    test("task remains blocked when using permission format override", () => {
      // given
      const override = {
        permission: {
          task: "allow",
          call_agent: "allow",
          read: "allow",
        },
      } as { permission: Record<string, string> }

      // when
      const result = createCadetAgentWithOverrides(override as Parameters<typeof createCadetAgentWithOverrides>[0])

      // then - task blocked, but call_agent allowed for lookout/archivist spawning
      const tools = result.tools as Record<string, boolean> | undefined
      const permission = result.permission as Record<string, string> | undefined
      if (tools) {
        expect(tools.task).toBe(false)
        expect(tools.call_agent).toBe(true)
      }
      if (permission) {
        expect(permission.task).toBe("deny")
        expect(permission.call_agent).toBe("allow")
      }
    })
  })

  describe("useTaskSystem integration", () => {
    test("useTaskSystem=true produces Task_Discipline prompt for Claude", () => {
      //#given
      const override = { model: "anthropic/claude-sonnet-4-6" }

      //#when
      const result = createCadetAgentWithOverrides(override, undefined, true)

      //#then
      expect(result.prompt).toContain("task_create")
      expect(result.prompt).toContain("task_update")
      expect(result.prompt).not.toContain("todowrite")
    })

    test("useTaskSystem=true produces Task Discipline prompt for GPT", () => {
      //#given
      const override = { model: "openai/gpt-5.2" }

      //#when
      const result = createCadetAgentWithOverrides(override, undefined, true)

      //#then
      expect(result.prompt).toContain("Task Discipline")
      expect(result.prompt).toContain("task_create")
      expect(result.prompt).not.toContain("Todo Discipline")
    })

    test("useTaskSystem=false (default) produces Todo_Discipline prompt", () => {
      //#given
      const override = {}

      //#when
      const result = createCadetAgentWithOverrides(override)

      //#then
      expect(result.prompt).toContain("todowrite")
      expect(result.prompt).not.toContain("task_create")
    })

    test("useTaskSystem=true includes task_create/task_update in Claude prompt", () => {
      //#given
      const override = { model: "anthropic/claude-sonnet-4-6" }

      //#when
      const result = createCadetAgentWithOverrides(override, undefined, true)

      //#then
      expect(result.prompt).toContain("task_create")
      expect(result.prompt).toContain("task_update")
    })

    test("useTaskSystem=true includes task_create/task_update in GPT prompt", () => {
      //#given
      const override = { model: "openai/gpt-5.2" }

      //#when
      const result = createCadetAgentWithOverrides(override, undefined, true)

      //#then
      expect(result.prompt).toContain("task_create")
      expect(result.prompt).toContain("task_update")
    })

    test("useTaskSystem=false uses todowrite instead of task_create", () => {
      //#given
      const override = { model: "anthropic/claude-sonnet-4-6" }

      //#when
      const result = createCadetAgentWithOverrides(override, undefined, false)

      //#then
      expect(result.prompt).toContain("todowrite")
      expect(result.prompt).not.toContain("task_create")
    })
  })

  describe("prompt composition", () => {
    test("base prompt contains identity", () => {
      // given
      const override = {}

      // when
      const result = createCadetAgentWithOverrides(override)

      // then
      expect(result.prompt).toContain("Cadet")
      expect(result.prompt).toContain("Execute tasks directly")
    })

    test("Claude model uses default prompt with discipline section", () => {
      // given
      const override = { model: "anthropic/claude-sonnet-4-6" }

      // when
      const result = createCadetAgentWithOverrides(override)

      // then
      expect(result.prompt).toContain("<Role>")
      expect(result.prompt).toContain("todowrite")
    })

    test("GPT model uses GPT-optimized prompt with Craftsman-style sections", () => {
      // given
      const override = { model: "openai/gpt-5.2" }

      // when
      const result = createCadetAgentWithOverrides(override)

      // then
      expect(result.prompt).toContain("Scope Discipline")
      expect(result.prompt).toContain("<tool_usage_rules>")
      expect(result.prompt).toContain("Progress Updates")
    })

    test("prompt_append is added after base prompt", () => {
      // given
      const override = { prompt_append: "CUSTOM_MARKER_FOR_TEST" }

      // when
      const result = createCadetAgentWithOverrides(override)

      // then
      const baseEndIndex = result.prompt!.indexOf("</Style>")
      const appendIndex = result.prompt!.indexOf("CUSTOM_MARKER_FOR_TEST")
      expect(baseEndIndex).not.toBe(-1)
      expect(appendIndex).toBeGreaterThan(baseEndIndex)
    })
  })
})

describe("getCadetPromptSource", () => {
  test("returns 'gpt' for OpenAI models", () => {
    // given
    const model = "openai/gpt-5.2"

    // when
    const source = getCadetPromptSource(model)

    // then
    expect(source).toBe("gpt")
  })

  test("returns 'gpt' for GitHub Copilot GPT models", () => {
    // given
    const model = "github-copilot/gpt-4o"

    // when
    const source = getCadetPromptSource(model)

    // then
    expect(source).toBe("gpt")
  })

  test("returns 'default' for Claude models", () => {
    // given
    const model = "anthropic/claude-sonnet-4-6"

    // when
    const source = getCadetPromptSource(model)

    // then
    expect(source).toBe("default")
  })

  test("returns 'default' for undefined model", () => {
    // given
    const model = undefined

    // when
    const source = getCadetPromptSource(model)

    // then
    expect(source).toBe("default")
  })
})

describe("buildCadetPrompt", () => {
  test("GPT model prompt contains Craftsman-style sections", () => {
    // given
    const model = "openai/gpt-5.2"

    // when
    const prompt = buildCadetPrompt(model, false)

    // then
    expect(prompt).toContain("## Identity")
    expect(prompt).toContain("Scope Discipline")
    expect(prompt).toContain("<tool_usage_rules>")
    expect(prompt).toContain("Progress Updates")
  })

  test("Claude model prompt contains Claude-specific sections", () => {
    // given
    const model = "anthropic/claude-sonnet-4-6"

    // when
    const prompt = buildCadetPrompt(model, false)

    // then
    expect(prompt).toContain("<Role>")
    expect(prompt).toContain("<Todo_Discipline>")
    expect(prompt).toContain("todowrite")
  })

  test("useTaskSystem=true includes Task Discipline for GPT", () => {
    // given
    const model = "openai/gpt-5.2"

    // when
    const prompt = buildCadetPrompt(model, true)

    // then
    expect(prompt).toContain("Task Discipline")
    expect(prompt).toContain("task_create")
  })

  test("useTaskSystem=false includes Todo_Discipline for Claude", () => {
    // given
    const model = "anthropic/claude-sonnet-4-6"

    // when
    const prompt = buildCadetPrompt(model, false)

    // then
    expect(prompt).toContain("<Todo_Discipline>")
    expect(prompt).toContain("todowrite")
  })
})
