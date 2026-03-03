import type { PluginInput } from "@opencode-ai/plugin"

const CREW_SPINNER = ["·", "•", "●", "○", "◌", "◦", " "]

export async function showSpinnerToast(ctx: PluginInput, version: string, message: string): Promise<void> {
  const totalDuration = 5000
  const frameInterval = 100
  const totalFrames = Math.floor(totalDuration / frameInterval)

  for (let i = 0; i < totalFrames; i++) {
    const spinner = CREW_SPINNER[i % CREW_SPINNER.length]
    await ctx.client.tui
      .showToast({
        body: {
          title: `${spinner} OpenCodeCrew ${version}`,
          message,
          variant: "info" as const,
          duration: frameInterval + 50,
        },
      })
      .catch(() => {})

    await new Promise((resolve) => setTimeout(resolve, frameInterval))
  }
}
