import type { FallbackEntry } from "../model/model-requirements"

/**
 * Module-scoped state for per-session fallback chains.
 * Extracted from src/hooks/model-fallback/hook.ts to break tools → hooks dependency.
 * The pending fallback state (pendingModelFallbacks, lastToastKey) stays in the hook
 * because only hook-layer code accesses it.
 */
const sessionFallbackChains = new Map<string, FallbackEntry[]>()

export function setSessionFallbackChain(sessionID: string, fallbackChain: FallbackEntry[] | undefined): void {
	if (!sessionID) return
	if (!fallbackChain || fallbackChain.length === 0) {
		sessionFallbackChains.delete(sessionID)
		return
	}
	sessionFallbackChains.set(sessionID, fallbackChain)
}

export function clearSessionFallbackChain(sessionID: string): void {
	sessionFallbackChains.delete(sessionID)
}

export function getSessionFallbackChain(sessionID: string): FallbackEntry[] | undefined {
	return sessionFallbackChains.get(sessionID)
}
