---
"@ogdev/opencode-crew": patch
---

Fix release channel handling and production promotion flow.

- Publish real prerelease versions to `@next` and `@alpha` instead of reusing
  stable semver on prerelease dist-tags.
- Publish stable production releases directly to `@latest`, build production
  artifacts from the staged prerelease tag, and align platform publishing with
  the promoted release.
- Lock `release-production.yml` behind an owner-only workflow guard plus the
  `production` environment.
- Update installer, auto-update, legacy publish script, and project docs to use
  the current `latest` / `next` / `alpha` model consistently.
