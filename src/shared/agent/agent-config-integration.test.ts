import { describe, test, expect } from "bun:test"
import { migrateAgentNames } from "../migration"
import { getAgentDisplayName } from "./agent-display-names"
import { AGENT_MODEL_REQUIREMENTS } from "../model/model-requirements"

describe("Agent Config Integration", () => {
  describe("Old format config migration", () => {
    test("migrates old format agent keys to lowercase", () => {
      // given - config with old format keys
      const oldConfig = {
        Captain: { model: "anthropic/claude-opus-4-6" },
        Relay: { model: "anthropic/claude-opus-4-6" },
        "Strategist (Planner)": { model: "anthropic/claude-opus-4-6" },
        "Assessor (Plan Consultant)": { model: "anthropic/claude-sonnet-4-6" },
        "Critic (Plan Reviewer)": { model: "anthropic/claude-sonnet-4-6" },
      }

      // when - migration is applied
      const result = migrateAgentNames(oldConfig)

      // then - keys are lowercase
      expect(result.migrated).toHaveProperty("captain")
      expect(result.migrated).toHaveProperty("relay")
      expect(result.migrated).toHaveProperty("strategist")
      expect(result.migrated).toHaveProperty("assessor")
      expect(result.migrated).toHaveProperty("critic")

      // then - old keys are removed
      expect(result.migrated).not.toHaveProperty("Captain")
      expect(result.migrated).not.toHaveProperty("Relay")
      expect(result.migrated).not.toHaveProperty("Strategist (Planner)")
      expect(result.migrated).not.toHaveProperty("Assessor (Plan Consultant)")
      expect(result.migrated).not.toHaveProperty("Critic (Plan Reviewer)")

      // then - values are preserved
      expect(result.migrated.captain).toEqual({ model: "anthropic/claude-opus-4-6" })
      expect(result.migrated.relay).toEqual({ model: "anthropic/claude-opus-4-6" })
      expect(result.migrated.strategist).toEqual({ model: "anthropic/claude-opus-4-6" })
      
      // then - changed flag is true
      expect(result.changed).toBe(true)
    })

    test("preserves already lowercase keys", () => {
      // given - config with lowercase keys
      const config = {
        captain: { model: "anthropic/claude-opus-4-6" },
        sage: { model: "openai/gpt-5.2" },
        archivist: { model: "opencode/big-pickle" },
      }

      // when - migration is applied
      const result = migrateAgentNames(config)

      // then - keys remain unchanged
      expect(result.migrated).toEqual(config)
      
      // then - changed flag is false
      expect(result.changed).toBe(false)
    })

    test("handles mixed case config", () => {
      // given - config with mixed old and new format
      const mixedConfig = {
        Captain: { model: "anthropic/claude-opus-4-6" },
        sage: { model: "openai/gpt-5.2" },
        "Strategist (Planner)": { model: "anthropic/claude-opus-4-6" },
        archivist: { model: "opencode/big-pickle" },
      }

      // when - migration is applied
      const result = migrateAgentNames(mixedConfig)

      // then - all keys are lowercase
      expect(result.migrated).toHaveProperty("captain")
      expect(result.migrated).toHaveProperty("sage")
      expect(result.migrated).toHaveProperty("strategist")
      expect(result.migrated).toHaveProperty("archivist")
      expect(Object.keys(result.migrated).every((key) => key === key.toLowerCase())).toBe(true)
      
      // then - changed flag is true
      expect(result.changed).toBe(true)
    })
  })

  describe("Display name resolution", () => {
    test("returns correct display names for all builtin agents", () => {
      // given - lowercase config keys
      const agents = ["captain", "relay", "strategist", "assessor", "critic", "sage", "archivist", "lookout", "spotter"]

      // when - display names are requested
      const displayNames = agents.map((agent) => getAgentDisplayName(agent))

      // then - display names are correct
      expect(displayNames).toContain("Captain (Ultraworker)")
      expect(displayNames).toContain("Relay (Plan Executor)")
      expect(displayNames).toContain("Strategist (Plan Builder)")
      expect(displayNames).toContain("Assessor (Plan Consultant)")
      expect(displayNames).toContain("Critic (Plan Critic)")
      expect(displayNames).toContain("sage")
      expect(displayNames).toContain("archivist")
      expect(displayNames).toContain("lookout")
      expect(displayNames).toContain("spotter")
    })

    test("handles lowercase keys case-insensitively", () => {
      // given - various case formats of lowercase keys
      const keys = ["Captain", "Relay", "CAPTAIN", "relay", "strategist", "STRATEGIST"]

      // when - display names are requested
      const displayNames = keys.map((key) => getAgentDisplayName(key))

      // then - correct display names are returned
      expect(displayNames[0]).toBe("Captain (Ultraworker)")
      expect(displayNames[1]).toBe("Relay (Plan Executor)")
      expect(displayNames[2]).toBe("Captain (Ultraworker)")
      expect(displayNames[3]).toBe("Relay (Plan Executor)")
      expect(displayNames[4]).toBe("Strategist (Plan Builder)")
      expect(displayNames[5]).toBe("Strategist (Plan Builder)")
    })

    test("returns original key for unknown agents", () => {
      // given - unknown agent key
      const unknownKey = "custom-agent"

      // when - display name is requested
      const displayName = getAgentDisplayName(unknownKey)

      // then - original key is returned
      expect(displayName).toBe(unknownKey)
    })
  })

  describe("Model requirements integration", () => {
    test("all model requirements use lowercase keys", () => {
      // given - AGENT_MODEL_REQUIREMENTS object
      const agentKeys = Object.keys(AGENT_MODEL_REQUIREMENTS)

      // when - checking key format
      const allLowercase = agentKeys.every((key) => key === key.toLowerCase())

      // then - all keys are lowercase
      expect(allLowercase).toBe(true)
    })

    test("model requirements include all builtin agents", () => {
      // given - expected builtin agents
      const expectedAgents = ["captain", "relay", "strategist", "assessor", "critic", "sage", "archivist", "lookout", "spotter"]

      // when - checking AGENT_MODEL_REQUIREMENTS
      const agentKeys = Object.keys(AGENT_MODEL_REQUIREMENTS)

      // then - all expected agents are present
      for (const agent of expectedAgents) {
        expect(agentKeys).toContain(agent)
      }
    })

    test("no uppercase keys in model requirements", () => {
      // given - AGENT_MODEL_REQUIREMENTS object
      const agentKeys = Object.keys(AGENT_MODEL_REQUIREMENTS)

      // when - checking for uppercase keys
      const uppercaseKeys = agentKeys.filter((key) => key !== key.toLowerCase())

      // then - no uppercase keys exist
      expect(uppercaseKeys).toEqual([])
    })
  })

  describe("End-to-end config flow", () => {
    test("old config migrates and displays correctly", () => {
      // given - old format config
      const oldConfig = {
        Captain: { model: "anthropic/claude-opus-4-6", temperature: 0.1 },
        "Strategist (Planner)": { model: "anthropic/claude-opus-4-6" },
      }

      // when - config is migrated
      const result = migrateAgentNames(oldConfig)

      // then - keys are lowercase
      expect(result.migrated).toHaveProperty("captain")
      expect(result.migrated).toHaveProperty("strategist")

      // when - display names are retrieved
      const captainDisplay = getAgentDisplayName("captain")
      const strategistDisplay = getAgentDisplayName("strategist")

      // then - display names are correct
      expect(captainDisplay).toBe("Captain (Ultraworker)")
      expect(strategistDisplay).toBe("Strategist (Plan Builder)")

      // then - config values are preserved
      expect(result.migrated.captain).toEqual({ model: "anthropic/claude-opus-4-6", temperature: 0.1 })
      expect(result.migrated.strategist).toEqual({ model: "anthropic/claude-opus-4-6" })
    })

    test("new config works without migration", () => {
      // given - new format config (already lowercase)
      const newConfig = {
        captain: { model: "anthropic/claude-opus-4-6" },
        relay: { model: "anthropic/claude-opus-4-6" },
      }

      // when - migration is applied (should be no-op)
      const result = migrateAgentNames(newConfig)

      // then - config is unchanged
      expect(result.migrated).toEqual(newConfig)
      
      // then - changed flag is false
      expect(result.changed).toBe(false)

      // when - display names are retrieved
      const captainDisplay = getAgentDisplayName("captain")
      const relayDisplay = getAgentDisplayName("relay")

      // then - display names are correct
      expect(captainDisplay).toBe("Captain (Ultraworker)")
      expect(relayDisplay).toBe("Relay (Plan Executor)")
    })
  })
})
