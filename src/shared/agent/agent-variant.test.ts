import { describe, expect, test } from "bun:test"
import type { OpenCodeCrewConfig } from "../../config"
import { applyAgentVariant, resolveAgentVariant, resolveVariantForModel } from "./agent-variant"

describe("resolveAgentVariant", () => {
  test("returns undefined when agent name missing", () => {
    // given
    const config = {} as OpenCodeCrewConfig

    // when
    const variant = resolveAgentVariant(config)

    // then
    expect(variant).toBeUndefined()
  })

  test("returns agent override variant", () => {
    // given
    const config = {
      agents: {
        captain: { variant: "low" },
      },
    } as OpenCodeCrewConfig

    // when
    const variant = resolveAgentVariant(config, "captain")

    // then
    expect(variant).toBe("low")
  })

  test("returns category variant when agent uses category", () => {
    // given
    const config = {
      agents: {
        captain: { category: "ultrabrain" },
      },
      categories: {
        ultrabrain: { model: "openai/gpt-5.2", variant: "xhigh" },
      },
    } as OpenCodeCrewConfig

    // when
    const variant = resolveAgentVariant(config, "captain")

    // then
    expect(variant).toBe("xhigh")
  })
})

describe("applyAgentVariant", () => {
  test("sets variant when message is undefined", () => {
    // given
    const config = {
      agents: {
        captain: { variant: "low" },
      },
    } as OpenCodeCrewConfig
    const message: { variant?: string } = {}

    // when
    applyAgentVariant(config, "captain", message)

    // then
    expect(message.variant).toBe("low")
  })

  test("does not override existing variant", () => {
    // given
    const config = {
      agents: {
        captain: { variant: "low" },
      },
    } as OpenCodeCrewConfig
    const message = { variant: "max" }

    // when
    applyAgentVariant(config, "captain", message)

    // then
    expect(message.variant).toBe("max")
  })
})

describe("resolveVariantForModel", () => {
  test("returns agent override variant when configured", () => {
    // given - use a model in captain chain (claude-opus-4-6 has default variant "max")
    // to verify override takes precedence over fallback chain
    const config = {
      agents: {
        captain: { variant: "high" },
      },
    } as OpenCodeCrewConfig
    const model = { providerID: "anthropic", modelID: "claude-opus-4-6" }

    // when
    const variant = resolveVariantForModel(config, "captain", model)

    // then
    expect(variant).toBe("high")
  })

  test("returns correct variant for anthropic provider", () => {
    // given
    const config = {} as OpenCodeCrewConfig
    const model = { providerID: "anthropic", modelID: "claude-opus-4-6" }

    // when
    const variant = resolveVariantForModel(config, "captain", model)

    // then
    expect(variant).toBe("max")
  })

  test("returns correct variant for openai provider (craftsman agent)", () => {
    // #given craftsman has openai/gpt-5.3-codex with variant "medium" in its chain
    const config = {} as OpenCodeCrewConfig
    const model = { providerID: "openai", modelID: "gpt-5.3-codex" }

    // #when
    const variant = resolveVariantForModel(config, "craftsman", model)

    // then
    expect(variant).toBe("medium")
  })

  test("returns undefined for provider not in captain chain", () => {
    // #given openai is not in captain fallback chain anymore
    const config = {} as OpenCodeCrewConfig
    const model = { providerID: "openai", modelID: "gpt-5.2" }

    // when
    const variant = resolveVariantForModel(config, "captain", model)

    // then
    expect(variant).toBeUndefined()
  })

  test("returns undefined for provider not in chain", () => {
    // given
    const config = {} as OpenCodeCrewConfig
    const model = { providerID: "unknown-provider", modelID: "some-model" }

    // when
    const variant = resolveVariantForModel(config, "captain", model)

    // then
    expect(variant).toBeUndefined()
  })

  test("returns undefined for unknown agent", () => {
    // given
    const config = {} as OpenCodeCrewConfig
    const model = { providerID: "anthropic", modelID: "claude-opus-4-6" }

    // when
    const variant = resolveVariantForModel(config, "nonexistent-agent", model)

    // then
    expect(variant).toBeUndefined()
  })

  test("returns variant for zai-coding-plan provider without variant", () => {
    // given
    const config = {} as OpenCodeCrewConfig
    const model = { providerID: "zai-coding-plan", modelID: "glm-5" }

    // when
    const variant = resolveVariantForModel(config, "captain", model)

    // then
    expect(variant).toBeUndefined()
  })

  test("falls back to category chain when agent has no requirement", () => {
    // given
    const config = {
      agents: {
        "custom-agent": { category: "ultrabrain" },
      },
    } as OpenCodeCrewConfig
    const model = { providerID: "openai", modelID: "gpt-5.3-codex" }

    // when
    const variant = resolveVariantForModel(config, "custom-agent", model)

    // then
    expect(variant).toBe("xhigh")
  })

  test("returns correct variant for sage agent with openai", () => {
    // given
    const config = {} as OpenCodeCrewConfig
    const model = { providerID: "openai", modelID: "gpt-5.2" }

    // when
    const variant = resolveVariantForModel(config, "sage", model)

    // then
    expect(variant).toBe("high")
  })

  test("returns correct variant for sage agent with anthropic", () => {
    // given
    const config = {} as OpenCodeCrewConfig
    const model = { providerID: "anthropic", modelID: "claude-opus-4-6" }

    // when
    const variant = resolveVariantForModel(config, "sage", model)

    // then
    expect(variant).toBe("max")
  })
})
