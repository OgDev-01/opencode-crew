import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs"
import { resetConfigContext } from "./config-context"

let testConfigDir: string
let testConfigPath: string
let testCounter = 0

beforeEach(() => {
  testCounter++
  testConfigDir = join(tmpdir(), `test-opencode-channel-${Date.now()}-${testCounter}`)
  testConfigPath = join(testConfigDir, "opencode.json")
  mkdirSync(testConfigDir, { recursive: true })

  process.env.OPENCODE_CONFIG_DIR = testConfigDir
  resetConfigContext()
})

afterEach(() => {
  try {
    rmSync(testConfigDir, { recursive: true, force: true })
  } catch {}
})

describe("addPluginToOpenCodeConfig", () => {
  describe("#given non-stable channel", () => {
    describe("#when channel is next", () => {
      it("writes @next plugin entry", async () => {
        writeFileSync(testConfigPath, JSON.stringify({ provider: {} }, null, 2) + "\n")

        const { addPluginToOpenCodeConfig } = await import("./add-plugin-to-opencode-config")
        const result = await addPluginToOpenCodeConfig("1.0.0", "next")

        expect(result.success).toBe(true)

        const content = readFileSync(result.configPath, "utf-8")
        const parsed = JSON.parse(content)
        expect(parsed.plugin).toContain("@ogdev/opencode-crew@next")
      })
    })

    describe("#when channel is alpha", () => {
      it("writes @alpha plugin entry", async () => {
        writeFileSync(testConfigPath, JSON.stringify({ provider: {} }, null, 2) + "\n")

        const { addPluginToOpenCodeConfig } = await import("./add-plugin-to-opencode-config")
        const result = await addPluginToOpenCodeConfig("1.0.0", "alpha")

        expect(result.success).toBe(true)

        const content = readFileSync(result.configPath, "utf-8")
        const parsed = JSON.parse(content)
        expect(parsed.plugin).toContain("@ogdev/opencode-crew@alpha")
      })
    })

    describe("#when existing plugin entry present", () => {
      it("replaces existing entry with channel-tagged version", async () => {
        const config = { plugin: ["@ogdev/opencode-crew@latest"], provider: {} }
        writeFileSync(testConfigPath, JSON.stringify(config, null, 2) + "\n")

        const { addPluginToOpenCodeConfig } = await import("./add-plugin-to-opencode-config")
        const result = await addPluginToOpenCodeConfig("1.0.0", "alpha")

        expect(result.success).toBe(true)

        const content = readFileSync(result.configPath, "utf-8")
        const parsed = JSON.parse(content)
        expect(parsed.plugin).toContain("@ogdev/opencode-crew@alpha")
        expect(parsed.plugin).not.toContain("@ogdev/opencode-crew@latest")
        expect(parsed.plugin.length).toBe(1)
      })
    })
  })

  describe("#given stable channel", () => {
    describe("#when fetchNpmDistTags resolves version to latest tag", () => {
      it("writes versioned plugin entry", async () => {
        writeFileSync(testConfigPath, JSON.stringify({ provider: {} }, null, 2) + "\n")

        const distTagsModule = await import("./npm-dist-tags")
        spyOn(distTagsModule, "fetchNpmDistTags").mockResolvedValue({ latest: "1.1.0" })

        const { addPluginToOpenCodeConfig } = await import("./add-plugin-to-opencode-config")
        const result = await addPluginToOpenCodeConfig("1.1.0")

        expect(result.success).toBe(true)

        const content = readFileSync(result.configPath, "utf-8")
        const parsed = JSON.parse(content)
        expect(parsed.plugin).toContain("@ogdev/opencode-crew@latest")
      })
    })
  })
})
