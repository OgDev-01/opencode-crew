import { describe, expect, it } from "bun:test"
import { getPluginNameForChannel } from "./plugin-name-with-version"

describe("getPluginNameForChannel", () => {
  describe("#given stable channel", () => {
    it("returns package name without tag", () => {
      const result = getPluginNameForChannel("stable")

      expect(result).toBe("@ogdev/opencode-crew")
    })
  })

  describe("#given next channel", () => {
    it("returns package name with @next tag", () => {
      const result = getPluginNameForChannel("next")

      expect(result).toBe("@ogdev/opencode-crew@next")
    })
  })

  describe("#given alpha channel", () => {
    it("returns package name with @alpha tag", () => {
      const result = getPluginNameForChannel("alpha")

      expect(result).toBe("@ogdev/opencode-crew@alpha")
    })
  })
})
