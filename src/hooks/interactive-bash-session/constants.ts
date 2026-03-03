import { join } from "node:path";
import { OPENCODE_STORAGE } from "@/shared";
export const INTERACTIVE_BASH_SESSION_STORAGE = join(
  OPENCODE_STORAGE,
  "interactive-bash-session",
);

export const CREW_SESSION_PREFIX = "crew-";

export function buildSessionReminderMessage(sessions: string[]): string {
  if (sessions.length === 0) return "";
  return `\n\n[System Reminder] Active crew-* tmux sessions: ${sessions.join(", ")}`;
}
