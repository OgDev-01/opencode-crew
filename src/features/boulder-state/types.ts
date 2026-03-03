/**
 * Boulder State Types
 *
 * Manages the active work plan state for the Captain orchestrator.
 * Named after the boulder metaphor - the persistent task state that keeps rolling forward.
 */

export interface BoulderState {
  /** Absolute path to the active plan file */
  active_plan: string
  /** ISO timestamp when work started */
  started_at: string
  /** Session IDs that have worked on this plan */
  session_ids: string[]
  /** Plan name derived from filename */
  plan_name: string
  /** Agent type to use when resuming (e.g., 'relay') */
  agent?: string
  /** Absolute path to the git worktree root where work happens */
  worktree_path?: string
}

export interface PlanProgress {
  /** Total number of checkboxes */
  total: number
  /** Number of completed checkboxes */
  completed: number
  /** Whether all tasks are done */
  isComplete: boolean
}
