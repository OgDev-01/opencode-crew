/// <reference types="bun-types" />

import { describe, it, expect } from "bun:test"
import type { OpenCodeCrewConfig } from "../../config"
import { resolveRunAgent, waitForEventProcessorShutdown } from "./runner"

const createConfig = (overrides: Partial<OpenCodeCrewConfig> = {}): OpenCodeCrewConfig => ({
  ...overrides,
})

describe("resolveRunAgent", () => {
  it("uses CLI agent over env and config", () => {
    // given
    const config = createConfig({ default_run_agent: "strategist" })
    const env = { OPENCODE_DEFAULT_AGENT: "Relay" }

    // when
    const agent = resolveRunAgent(
      { message: "test", agent: "Craftsman" },
      config,
      env
    )

    // then
    expect(agent).toBe("Craftsman (Deep Agent)")
  })

  it("uses env agent over config", () => {
    // given
    const config = createConfig({ default_run_agent: "strategist" })
    const env = { OPENCODE_DEFAULT_AGENT: "Relay" }

    // when
    const agent = resolveRunAgent({ message: "test" }, config, env)

    // then
    expect(agent).toBe("Relay (Plan Executor)")
  })

  it("uses config agent over default", () => {
    // given
    const config = createConfig({ default_run_agent: "Strategist" })

    // when
    const agent = resolveRunAgent({ message: "test" }, config, {})

    // then
    expect(agent).toBe("Strategist (Plan Builder)")
  })

  it("falls back to captain when none set", () => {
    // given
    const config = createConfig()

    // when
    const agent = resolveRunAgent({ message: "test" }, config, {})

    // then
    expect(agent).toBe("Captain (Ultraworker)")
  })

  it("skips disabled captain for next available core agent", () => {
    // given
    const config = createConfig({ disabled_agents: ["captain"] })

    // when
    const agent = resolveRunAgent({ message: "test" }, config, {})

    // then
    expect(agent).toBe("Craftsman (Deep Agent)")
  })

  it("maps display-name style default_run_agent values to canonical display names", () => {
    // given
    const config = createConfig({ default_run_agent: "Captain (Ultraworker)" })

    // when
    const agent = resolveRunAgent({ message: "test" }, config, {})

    // then
    expect(agent).toBe("Captain (Ultraworker)")
  })
})

describe("waitForEventProcessorShutdown", () => {

  it("returns quickly when event processor completes", async () => {
    //#given
    const eventProcessor = new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve()
      }, 25)
    })
    const start = performance.now()

    //#when
    await waitForEventProcessorShutdown(eventProcessor, 200)

    //#then
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(200)
  })

  it("times out and continues when event processor does not complete", async () => {
    //#given
    const eventProcessor = new Promise<void>(() => {})
    const timeoutMs = 200
    const start = performance.now()

    //#when
    await waitForEventProcessorShutdown(eventProcessor, timeoutMs)

    //#then
    const elapsed = performance.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(timeoutMs - 10)
  })
})
