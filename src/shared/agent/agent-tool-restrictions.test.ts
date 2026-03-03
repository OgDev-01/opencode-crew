import { describe, expect, test, beforeEach } from "bun:test"
import {
  getAgentToolRestrictions,
  hasAgentToolRestrictions,
  setAgentToolOverrides,
  clearAgentToolOverrides,
} from "./agent-tool-restrictions"

describe("agent-tool-restrictions", () => {
  beforeEach(() => {
    clearAgentToolOverrides()
  })

  describe("#given no agent overrides config for a category #when getAgentToolRestrictions is called #then hardcoded AGENT_RESTRICTIONS defaults are used", () => {
    test("lookout agent returns hardcoded denylist", () => {
      const restrictions = getAgentToolRestrictions("lookout")
      expect(restrictions).toEqual({
        write: false,
        edit: false,
        task: false,
        call_agent: false,
      })
    })

    test("cadet returns hardcoded denylist", () => {
      const restrictions = getAgentToolRestrictions("cadet")
      expect(restrictions).toEqual({ task: false })
    })

    test("unknown agent returns empty object", () => {
      const restrictions = getAgentToolRestrictions("unknown-agent")
      expect(restrictions).toEqual({})
    })
  })

  describe("#given agent overrides config has tools.deny for a category #when getAgentToolRestrictions is called #then denied tools override defaults", () => {
    test("interactive_bash denied for lookout agent via config", () => {
      setAgentToolOverrides("lookout", { interactive_bash: false })

      const restrictions = getAgentToolRestrictions("lookout")

      expect(restrictions.interactive_bash).toBe(false)
      expect(restrictions.write).toBe(false)
      expect(restrictions.edit).toBe(false)
    })

    test("config deny overrides hardcoded allow", () => {
      setAgentToolOverrides("spotter", { read: false })

      const restrictions = getAgentToolRestrictions("spotter")

      expect(restrictions.read).toBe(false)
    })
  })

  describe("#given agent overrides config has tools.allow for a category #when getAgentToolRestrictions is called #then allowed tools override defaults", () => {
    test("config allow overrides hardcoded deny", () => {
      setAgentToolOverrides("lookout", { write: true })

      const restrictions = getAgentToolRestrictions("lookout")

      expect(restrictions.write).toBe(true)
      expect(restrictions.edit).toBe(false)
      expect(restrictions.task).toBe(false)
    })

    test("config adds new tool allowance for agent with no hardcoded restrictions", () => {
      setAgentToolOverrides("some-custom-agent", { bash: true, grep: true })

      const restrictions = getAgentToolRestrictions("some-custom-agent")

      expect(restrictions.bash).toBe(true)
      expect(restrictions.grep).toBe(true)
    })
  })

  describe("#given agent overrides config is set and then cleared #when getAgentToolRestrictions is called #then defaults are restored", () => {
    test("clearAgentToolOverrides removes all overrides", () => {
      setAgentToolOverrides("lookout", { write: true })
      clearAgentToolOverrides()

      const restrictions = getAgentToolRestrictions("lookout")

      expect(restrictions.write).toBe(false)
    })
  })

  describe("#given hasAgentToolRestrictions #when called with config overrides #then returns true for agents with config-only restrictions", () => {
    test("returns true for agent with config overrides but no hardcoded restrictions", () => {
      setAgentToolOverrides("some-new-agent", { bash: false })

      expect(hasAgentToolRestrictions("some-new-agent")).toBe(true)
    })
  })
})
