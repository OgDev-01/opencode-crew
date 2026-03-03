/// <reference types="bun-types" />

import { describe, it, expect, beforeEach, spyOn } from "bun:test"
import * as nodeFs from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"

describe("skill-content-cache", () => {
	let testDir: string
	let skillPath: string
	const skillContent = `---
name: test-skill
description: A test skill
---

This is the skill body content.`

	beforeEach(() => {
		const unique = `skill-cache-test-${Date.now()}-${Math.random().toString(16).slice(2)}`
		testDir = join(tmpdir(), unique)
		mkdirSync(testDir, { recursive: true })
		skillPath = join(testDir, "SKILL.md")
		writeFileSync(skillPath, skillContent, "utf-8")
	})

	describe("#given a skill loaded via extractSkillTemplate #when accessed for the first time #then it reads from disk and caches", () => {
		it("should read from disk on first access", async () => {
			const { extractSkillTemplate } = await import("./loaded-skill-template-extractor")
			const { invalidateSkillContentCache } = await import("./skill-content-cache")

			invalidateSkillContentCache()

			const readFileSyncSpy = spyOn(nodeFs, "readFileSync")

			const skill = {
				name: "test-skill",
				path: skillPath,
				definition: { name: "test-skill", description: "A test skill", template: "" },
				scope: "project" as const,
			}

			const result = extractSkillTemplate(skill)

			expect(result).toContain("This is the skill body content.")
			expect(readFileSyncSpy).toHaveBeenCalledWith(skillPath, "utf-8")

			readFileSyncSpy.mockRestore()
		})
	})

	describe("#given a skill already loaded once #when accessed a second time #then it uses the cache without reading disk", () => {
		it("should not read from disk on second access", async () => {
			const { extractSkillTemplate } = await import("./loaded-skill-template-extractor")
			const { invalidateSkillContentCache } = await import("./skill-content-cache")

			invalidateSkillContentCache()

			const skill = {
				name: "test-skill",
				path: skillPath,
				definition: { name: "test-skill", description: "A test skill", template: "" },
				scope: "project" as const,
			}

			// First access — loads from disk
			extractSkillTemplate(skill)

			// Spy AFTER first access
			const readFileSyncSpy = spyOn(nodeFs, "readFileSync")

			// Second access — should use cache
			const result = extractSkillTemplate(skill)

			expect(result).toContain("This is the skill body content.")
			expect(readFileSyncSpy).not.toHaveBeenCalled()

			readFileSyncSpy.mockRestore()
		})
	})

	describe("#given no skills have been accessed #when checking cache state #then no disk reads have occurred", () => {
		it("should not read any files when no skills are accessed", async () => {
			const { invalidateSkillContentCache } = await import("./skill-content-cache")

			invalidateSkillContentCache()

			const readFileSyncSpy = spyOn(nodeFs, "readFileSync")

			// Do nothing — no skill access

			expect(readFileSyncSpy).not.toHaveBeenCalled()

			readFileSyncSpy.mockRestore()
		})
	})

	describe("#given a cached skill #when invalidateSkillContentCache is called #then the next access reads from disk again", () => {
		it("should clear the cache and re-read from disk", async () => {
			const { extractSkillTemplate } = await import("./loaded-skill-template-extractor")
			const { invalidateSkillContentCache } = await import("./skill-content-cache")

			invalidateSkillContentCache()

			const skill = {
				name: "test-skill",
				path: skillPath,
				definition: { name: "test-skill", description: "A test skill", template: "" },
				scope: "project" as const,
			}

			// First access — loads from disk
			extractSkillTemplate(skill)

			// Invalidate
			invalidateSkillContentCache()

			// Spy after invalidation
			const readFileSyncSpy = spyOn(nodeFs, "readFileSync")

			// Third access — should read from disk again
			const result = extractSkillTemplate(skill)

			expect(result).toContain("This is the skill body content.")
			expect(readFileSyncSpy).toHaveBeenCalledWith(skillPath, "utf-8")

			readFileSyncSpy.mockRestore()
		})
	})

	describe("#given a skill file that changed on disk #when cache is invalidated and skill re-accessed #then the new content is returned", () => {
		it("should return updated content after invalidation", async () => {
			const { extractSkillTemplate } = await import("./loaded-skill-template-extractor")
			const { invalidateSkillContentCache } = await import("./skill-content-cache")

			invalidateSkillContentCache()

			const skill = {
				name: "test-skill",
				path: skillPath,
				definition: { name: "test-skill", description: "A test skill", template: "" },
				scope: "project" as const,
			}

			// First access
			const firstResult = extractSkillTemplate(skill)
			expect(firstResult).toContain("This is the skill body content.")

			// Change file on disk
			const updatedContent = `---
name: test-skill
description: A test skill
---

Updated skill body content.`
			writeFileSync(skillPath, updatedContent, "utf-8")

			// Without invalidation, cache returns old content
			const cachedResult = extractSkillTemplate(skill)
			expect(cachedResult).toContain("This is the skill body content.")

			// Invalidate and re-access
			invalidateSkillContentCache()
			const freshResult = extractSkillTemplate(skill)
			expect(freshResult).toContain("Updated skill body content.")
		})
	})

	describe("#given loadSkillFromPath called #when examining the returned lazyContent #then it should be a lazy loader with loaded=false", () => {
		it("should create a lazy loader instead of eager loader", async () => {
			const { loadSkillFromPath } = await import("./loaded-skill-from-path")
			const { invalidateSkillContentCache } = await import("./skill-content-cache")

			invalidateSkillContentCache()

			const result = await loadSkillFromPath({
				skillPath,
				resolvedPath: testDir,
				defaultName: "test-skill",
				scope: "project",
			})

			expect(result).not.toBeNull()
			expect(result!.lazyContent).toBeDefined()
			expect(result!.lazyContent!.loaded).toBe(false)
			expect(result!.lazyContent!.content).toBeUndefined()
		})
	})

	describe("#given a lazy loader from loadSkillFromPath #when load() is called #then it returns the template content and marks loaded=true", () => {
		it("should load content on demand via load()", async () => {
			const { loadSkillFromPath } = await import("./loaded-skill-from-path")
			const { invalidateSkillContentCache } = await import("./skill-content-cache")

			invalidateSkillContentCache()

			const result = await loadSkillFromPath({
				skillPath,
				resolvedPath: testDir,
				defaultName: "test-skill",
				scope: "project",
			})

			expect(result).not.toBeNull()

			const content = await result!.lazyContent!.load()

			expect(content).toContain("This is the skill body content.")
			expect(result!.lazyContent!.loaded).toBe(true)
			expect(result!.lazyContent!.content).toBeDefined()
		})
	})
})
