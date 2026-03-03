import { describe, expect, spyOn, test } from "bun:test"
import { _resetForTesting, updateSessionAgent } from "../../features/claude-code-session-state"
import { getAgentDisplayName } from "../../shared/agent/agent-display-names"
import { createNoCaptainGptHook } from "./index"

const CAPTAIN_DISPLAY = getAgentDisplayName("captain")
const CRAFTSMAN_DISPLAY = getAgentDisplayName("craftsman")

type HookOutput = {
  message: { agent?: string; [key: string]: unknown }
  parts: unknown[]
}

function createOutput(): HookOutput {
  return {
    message: {},
    parts: [],
  }
}

describe("no-captain-gpt hook", () => {
  test("shows toast on every chat.message when captain uses gpt model", async () => {
    // given - captain (display name) with gpt model
    const showToast = spyOn({ fn: async () => ({}) }, "fn")
    const hook = createNoCaptainGptHook({
      client: { tui: { showToast } },
    } as any)

    const output1 = createOutput()
    const output2 = createOutput()

    // when - chat.message is called repeatedly with display name
    await hook["chat.message"]?.({
      sessionID: "ses_1",
      agent: CAPTAIN_DISPLAY,
      model: { providerID: "openai", modelID: "gpt-5.3-codex" },
    }, output1)
    await hook["chat.message"]?.({
      sessionID: "ses_1",
      agent: CAPTAIN_DISPLAY,
      model: { providerID: "openai", modelID: "gpt-5.3-codex" },
    }, output2)

    // then - toast is shown for every message
    expect(showToast).toHaveBeenCalledTimes(2)
    expect(output1.message.agent).toBe(CRAFTSMAN_DISPLAY)
    expect(output2.message.agent).toBe(CRAFTSMAN_DISPLAY)
    const calls = showToast.mock.calls as unknown[][]
    expect(calls[0]).toBeDefined()
    const firstToastArg = calls[0]?.[0]
    expect(firstToastArg).toMatchObject({
      body: {
        title: "NEVER Use Captain with GPT",
        message: expect.stringContaining("For GPT models, always use Craftsman."),
        variant: "error",
      },
    })
  })

  test("does not show toast for non-gpt model", async () => {
    // given - captain with claude model
    const showToast = spyOn({ fn: async () => ({}) }, "fn")
    const hook = createNoCaptainGptHook({
      client: { tui: { showToast } },
    } as any)

    const output = createOutput()

    // when - chat.message runs
    await hook["chat.message"]?.({
      sessionID: "ses_2",
      agent: CAPTAIN_DISPLAY,
      model: { providerID: "anthropic", modelID: "claude-opus-4-6" },
    }, output)

    // then - no toast
    expect(showToast).toHaveBeenCalledTimes(0)
    expect(output.message.agent).toBeUndefined()
  })

  test("does not show toast for non-captain agent", async () => {
    // given - craftsman with gpt model
    const showToast = spyOn({ fn: async () => ({}) }, "fn")
    const hook = createNoCaptainGptHook({
      client: { tui: { showToast } },
    } as any)

    const output = createOutput()

    // when - chat.message runs
    await hook["chat.message"]?.({
      sessionID: "ses_3",
      agent: CRAFTSMAN_DISPLAY,
      model: { providerID: "openai", modelID: "gpt-5.2" },
    }, output)

    // then - no toast
    expect(showToast).toHaveBeenCalledTimes(0)
    expect(output.message.agent).toBeUndefined()
  })

  test("uses session agent fallback when input agent is missing", async () => {
    // given - session agent saved with display name (as OpenCode stores it)
    _resetForTesting()
    updateSessionAgent("ses_4", CAPTAIN_DISPLAY)
    const showToast = spyOn({ fn: async () => ({}) }, "fn")
    const hook = createNoCaptainGptHook({
      client: { tui: { showToast } },
    } as any)

    const output = createOutput()

    // when - chat.message runs without input.agent
    await hook["chat.message"]?.({
      sessionID: "ses_4",
      model: { providerID: "openai", modelID: "gpt-5.2" },
    }, output)

    // then - toast shown via session-agent fallback
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(output.message.agent).toBe(CRAFTSMAN_DISPLAY)
  })
})
