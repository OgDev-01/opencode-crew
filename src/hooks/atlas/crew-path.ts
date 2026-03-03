/**
 * Cross-platform check if a path is inside .crew/ directory.
 * Handles both forward slashes (Unix) and backslashes (Windows).
 * Uses path segment matching (not substring) to avoid false positives like "not-crew/file.txt"
 */
export function isCrewPath(filePath: string): boolean {
  return /\.crew[/\\]/.test(filePath)
}
