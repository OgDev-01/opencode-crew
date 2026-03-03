import { describe, it, expect } from "bun:test"
import { AGENT_DISPLAY_NAMES, getAgentDisplayName, getAgentConfigKey } from "./agent-display-names"

describe("getAgentDisplayName", () => {
  it("returns display name for lowercase config key (new format)", () => {
    // given config key "captain"
    const configKey = "captain"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "Captain (Ultraworker)"
    expect(result).toBe("Captain (Ultraworker)")
  })

  it("returns display name for uppercase config key (old format - case-insensitive)", () => {
    // given config key "Captain" (old format)
    const configKey = "Captain"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "Captain (Ultraworker)" (case-insensitive lookup)
    expect(result).toBe("Captain (Ultraworker)")
  })

  it("returns original key for unknown agents (fallback)", () => {
    // given config key "custom-agent"
    const configKey = "custom-agent"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "custom-agent" (original key unchanged)
    expect(result).toBe("custom-agent")
  })

  it("returns display name for relay", () => {
    // given config key "relay"
    const configKey = "relay"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

     // then returns "Relay (Plan Executor)"
    expect(result).toBe("Relay (Plan Executor)")
  })

  it("returns display name for strategist", () => {
    // given config key "strategist"
    const configKey = "strategist"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "Strategist (Plan Builder)"
    expect(result).toBe("Strategist (Plan Builder)")
  })

  it("returns display name for cadet", () => {
    // given config key "cadet"
    const configKey = "cadet"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "Cadet"
    expect(result).toBe("Cadet")
  })

  it("returns display name for assessor", () => {
    // given config key "assessor"
    const configKey = "assessor"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "Assessor (Plan Consultant)"
    expect(result).toBe("Assessor (Plan Consultant)")
  })

  it("returns display name for critic", () => {
    // given config key "critic"
    const configKey = "critic"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

     // then returns "Critic (Plan Critic)"
    expect(result).toBe("Critic (Plan Critic)")
  })

  it("returns display name for sage", () => {
    // given config key "sage"
    const configKey = "sage"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "sage"
    expect(result).toBe("sage")
  })

  it("returns display name for archivist", () => {
    // given config key "archivist"
    const configKey = "archivist"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "archivist"
    expect(result).toBe("archivist")
  })

  it("returns display name for lookout", () => {
    // given config key "lookout"
    const configKey = "lookout"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "lookout"
    expect(result).toBe("lookout")
  })

  it("returns display name for spotter", () => {
    // given config key "spotter"
    const configKey = "spotter"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "spotter"
    expect(result).toBe("spotter")
  })
})

describe("getAgentConfigKey", () => {
  it("resolves display name to config key", () => {
    // given display name "Captain (Ultraworker)"
    // when getAgentConfigKey called
    // then returns "captain"
    expect(getAgentConfigKey("Captain (Ultraworker)")).toBe("captain")
  })

  it("resolves display name case-insensitively", () => {
    // given display name in different case
    // when getAgentConfigKey called
    // then returns "relay"
    expect(getAgentConfigKey("relay (plan executor)")).toBe("relay")
  })

  it("passes through lowercase config keys unchanged", () => {
    // given lowercase config key "strategist"
    // when getAgentConfigKey called
    // then returns "strategist"
    expect(getAgentConfigKey("strategist")).toBe("strategist")
  })

  it("returns lowercased unknown agents", () => {
    // given unknown agent name
    // when getAgentConfigKey called
    // then returns lowercased
    expect(getAgentConfigKey("Custom-Agent")).toBe("custom-agent")
  })

  it("resolves all core agent display names", () => {
    // given all core display names
    // when/then each resolves to its config key
    expect(getAgentConfigKey("Craftsman (Deep Agent)")).toBe("craftsman")
    expect(getAgentConfigKey("Strategist (Plan Builder)")).toBe("strategist")
    expect(getAgentConfigKey("Relay (Plan Executor)")).toBe("relay")
    expect(getAgentConfigKey("Assessor (Plan Consultant)")).toBe("assessor")
    expect(getAgentConfigKey("Critic (Plan Critic)")).toBe("critic")
    expect(getAgentConfigKey("Cadet")).toBe("cadet")
  })
})

describe("AGENT_DISPLAY_NAMES", () => {
  it("contains all expected agent mappings", () => {
    // given expected mappings
    const expectedMappings = {
      captain: "Captain (Ultraworker)",
      craftsman: "Craftsman (Deep Agent)",
      strategist: "Strategist (Plan Builder)",
      relay: "Relay (Plan Executor)",
      "cadet": "Cadet",
      assessor: "Assessor (Plan Consultant)",
      critic: "Critic (Plan Critic)",
      sage: "sage",
      archivist: "archivist",
      lookout: "lookout",
      "spotter": "spotter",
    }

    // when checking the constant
    // then contains all expected mappings
    expect(AGENT_DISPLAY_NAMES).toEqual(expectedMappings)
  })
})