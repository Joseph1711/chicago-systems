import { Collection } from "discord.js";

interface SpamTracker {
  count: number;
  resetAt: number;
  warned: boolean;
}

const tracker = new Collection<string, SpamTracker>();
const WINDOW_MS = 5000;
const MAX_INTERACTIONS = 5;

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = tracker.get(userId);

  if (!entry || now > entry.resetAt) {
    tracker.set(userId, { count: 1, resetAt: now + WINDOW_MS, warned: false });
    return false;
  }

  entry.count++;
  if (entry.count > MAX_INTERACTIONS) {
    return true;
  }

  return false;
}

export function isWarned(userId: string): boolean {
  return tracker.get(userId)?.warned ?? false;
}

export function markWarned(userId: string): void {
  const entry = tracker.get(userId);
  if (entry) entry.warned = true;
}
