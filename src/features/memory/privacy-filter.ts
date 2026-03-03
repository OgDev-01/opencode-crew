/**
 * Privacy filter module for memory system.
 * Strips content within privacy tags and redacts common secret patterns.
 * This is best-effort filtering, not a security guarantee.
 */

/**
 * Strips content within privacy tags and redacts common secret patterns.
 * @param content - The content to filter
 * @param privacyTags - List of custom tag names to strip (e.g., ['private', 'secret'])
 * @returns Filtered content with privacy tags and secrets replaced with [REDACTED]
 */
export function filterContent(content: string, privacyTags: string[]): string {
  let filtered = content;

  // Strip custom privacy tags (multiline-safe with RegExp flag)
  for (const tag of privacyTags) {
    const tagRegex = new RegExp(`<${tag}>.*?</${tag}>`, "gs");
    filtered = filtered.replace(tagRegex, "[REDACTED]");
  }

  // Redact AWS keys: AKIA followed by 16 uppercase alphanumeric chars
  filtered = filtered.replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED]");

  // Redact Stripe/OpenAI keys: sk- followed by 20+ chars (letters, numbers, -, _)
  filtered = filtered.replace(/sk-[a-zA-Z0-9\-_]{20,}/g, "[REDACTED]");

  // Redact GitHub tokens: ghp_ followed by 36 alphanumeric chars (case-insensitive)
  filtered = filtered.replace(/ghp_[a-zA-Z0-9]{36}/gi, "[REDACTED]");

  // Redact Bearer tokens: "Bearer" followed by JWT-like string
  filtered = filtered.replace(
    /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/g,
    "Bearer [REDACTED]"
  );

  return filtered;
}

/**
 * Returns true if the tool's output should NOT be stored in memory.
 * Expansion point for future tool-specific filtering logic.
 * @param toolName - The tool name to check
 * @returns true if tool output should be skipped, false otherwise
 */
export function shouldSkipTool(toolName: string): boolean {
  // v1: all tools pass through — content filtering via filterContent() handles secrets
  // Future: expand for known-noisy tools (e.g., 'bash' when inspecting .env reads)
  return false;
}

/**
 * Returns true if the file path should NOT trigger memory storage.
 * Checks for credential files, .env files, SSH keys, etc.
 * @param filePath - The file path to check
 * @returns true if file should be skipped, false otherwise
 */
export function shouldSkipFile(filePath: string): boolean {
  // Convert to lowercase for case-insensitive matching
  const lowerPath = filePath.toLowerCase();

  // Skip .env files and .env.* variants at start/end (but not .env in middle of filename)
  if (lowerPath.endsWith(".env")) {
    return true;
  }
  // Match .env.XXX at the start or after a path separator
  if (/(^|\/)\.env\.[a-z0-9]+$/i.test(lowerPath)) {
    return true;
  }

  // Skip credential files
  if (lowerPath.endsWith("credentials.json")) {
    return true;
  }

  // Skip certificate and key files
  if (lowerPath.endsWith(".pem") || lowerPath.endsWith(".key")) {
    return true;
  }

  // Skip SSH directory contents
  if (lowerPath.includes("/.ssh/")) {
    return true;
  }

  // Skip secrets files
  if (
    lowerPath.endsWith("secrets.yaml") ||
    lowerPath.endsWith("secrets.yml")
  ) {
    return true;
  }

  return false;
}
