import { describe, it, expect } from "bun:test"
import { remapAgentKeysToDisplayNames } from "./agent-key-remapper"

describe("remapAgentKeysToDisplayNames", () => {
  it("remaps known agent keys to display names", () => {
    // given agents with lowercase keys
    const agents = {
      captain: { prompt: "test", mode: "primary" },
      sage: { prompt: "test", mode: "subagent" },
    }

    // when remapping
    const result = remapAgentKeysToDisplayNames(agents)

    // then known agents get display name keys only
    expect(result["Captain (Ultraworker)"]).toBeDefined()
    expect(result["sage"]).toBeDefined()
    expect(result["captain"]).toBeUndefined()
  })

  it("preserves unknown agent keys unchanged", () => {
    // given agents with a custom key
    const agents = {
      "custom-agent": { prompt: "custom" },
    }

    // when remapping
    const result = remapAgentKeysToDisplayNames(agents)

    // then custom key is unchanged
    expect(result["custom-agent"]).toBeDefined()
  })

  it("remaps all core agents to display names", () => {
    // given all core agents
    const agents = {
      captain: {},
      craftsman: {},
      strategist: {},
      relay: {},
      assessor: {},
      critic: {},
      "cadet": {},
    }

    // when remapping
    const result = remapAgentKeysToDisplayNames(agents)

    // then all get display name keys without lowercase duplicates
    expect(result["Captain (Ultraworker)"]).toBeDefined()
    expect(result["captain"]).toBeUndefined()
    expect(result["Craftsman (Deep Agent)"]).toBeDefined()
    expect(result["craftsman"]).toBeUndefined()
    expect(result["Strategist (Plan Builder)"]).toBeDefined()
    expect(result["strategist"]).toBeUndefined()
    expect(result["Relay (Plan Executor)"]).toBeDefined()
    expect(result["relay"]).toBeUndefined()
    expect(result["Assessor (Plan Consultant)"]).toBeDefined()
    expect(result["assessor"]).toBeUndefined()
    expect(result["Critic (Plan Critic)"]).toBeDefined()
    expect(result["critic"]).toBeUndefined()
    expect(result["Cadet"]).toBeDefined()
    expect(result["cadet"]).toBeUndefined()
  })
})
