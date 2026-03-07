import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { updatePinnedVersion, revertPinnedVersion } from "./pinned-version-updater"

describe("pinned-version-updater", () => {
  let tmpDir: string
  let configPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crew-updater-test-"))
    configPath = path.join(tmpDir, "opencode.json")
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("updatePinnedVersion", () => {
    test("updates pinned version in config", () => {
      //#given
      const config = JSON.stringify({
        plugin: ["@ogdev/opencode-crew@1.2.1"],
      })
      fs.writeFileSync(configPath, config)

      //#when
      const result = updatePinnedVersion(configPath, "@ogdev/opencode-crew@1.2.1", "1.2.2")

      //#then
      expect(result).toBe(true)
      const updated = fs.readFileSync(configPath, "utf-8")
      expect(updated).toContain("@ogdev/opencode-crew@1.2.2")
      expect(updated).not.toContain("@ogdev/opencode-crew@1.2.1")
    })

    test("returns false when entry not found", () => {
      //#given
      const config = JSON.stringify({
        plugin: ["some-other-plugin"],
      })
      fs.writeFileSync(configPath, config)

      //#when
      const result = updatePinnedVersion(configPath, "@ogdev/opencode-crew@1.2.1", "1.2.2")

      //#then
      expect(result).toBe(false)
    })

    test("returns false when no plugin array exists", () => {
      //#given
      const config = JSON.stringify({ agent: {} })
      fs.writeFileSync(configPath, config)

      //#when
      const result = updatePinnedVersion(configPath, "@ogdev/opencode-crew@1.2.1", "1.2.2")

      //#then
      expect(result).toBe(false)
    })
  })

  describe("revertPinnedVersion", () => {
    test("reverts from failed version back to original entry", () => {
      //#given
      const config = JSON.stringify({
        plugin: ["@ogdev/opencode-crew@1.2.2"],
      })
      fs.writeFileSync(configPath, config)

      //#when
      const result = revertPinnedVersion(configPath, "1.2.2", "@ogdev/opencode-crew@1.2.1")

      //#then
      expect(result).toBe(true)
      const reverted = fs.readFileSync(configPath, "utf-8")
      expect(reverted).toContain("@ogdev/opencode-crew@1.2.1")
      expect(reverted).not.toContain("@ogdev/opencode-crew@1.2.2")
    })

    test("reverts to unpinned entry", () => {
      //#given
      const config = JSON.stringify({
        plugin: ["@ogdev/opencode-crew@1.2.2"],
      })
      fs.writeFileSync(configPath, config)

      //#when
      const result = revertPinnedVersion(configPath, "1.2.2", "@ogdev/opencode-crew")

      //#then
      expect(result).toBe(true)
      const reverted = fs.readFileSync(configPath, "utf-8")
      expect(reverted).toContain('"@ogdev/opencode-crew"')
      expect(reverted).not.toContain("@ogdev/opencode-crew@1.2.2")
    })

    test("returns false when failed version not found", () => {
      //#given
      const config = JSON.stringify({
        plugin: ["@ogdev/opencode-crew@1.2.1"],
      })
      fs.writeFileSync(configPath, config)

      //#when
      const result = revertPinnedVersion(configPath, "1.2.2", "@ogdev/opencode-crew@1.2.1")

      //#then
      expect(result).toBe(false)
    })
  })

  describe("update then revert roundtrip", () => {
    test("config returns to original state after update + revert", () => {
      //#given
      const originalConfig = JSON.stringify({
        plugin: ["@ogdev/opencode-crew@1.2.1"],
      })
      fs.writeFileSync(configPath, originalConfig)

      //#when
      updatePinnedVersion(configPath, "@ogdev/opencode-crew@1.2.1", "1.2.2")
      revertPinnedVersion(configPath, "1.2.2", "@ogdev/opencode-crew@1.2.1")

      //#then
      const finalConfig = fs.readFileSync(configPath, "utf-8")
      expect(finalConfig).toContain("@ogdev/opencode-crew@1.2.1")
      expect(finalConfig).not.toContain("@ogdev/opencode-crew@1.2.2")
    })
  })
})
