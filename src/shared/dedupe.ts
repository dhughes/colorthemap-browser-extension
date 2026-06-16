import type { GpsFormat } from "./formats";

export const DEFAULT_DEDUPE_WINDOW_MS = 3000;

interface Keyable {
  format: GpsFormat;
  url: string;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

export function dedupeKey(item: Keyable): string {
  return `${item.format}|${normalizeUrl(item.url)}`;
}

export interface RecentDetections {
  isDuplicate(item: Keyable, nowMs: number): boolean;
}

export function createRecentDetections(
  windowMs: number = DEFAULT_DEDUPE_WINDOW_MS,
): RecentDetections {
  const lastSeen = new Map<string, number>();

  function prune(nowMs: number): void {
    for (const [key, seenAt] of lastSeen) {
      if (nowMs - seenAt > windowMs) {
        lastSeen.delete(key);
      }
    }
  }

  return {
    isDuplicate(item, nowMs) {
      prune(nowMs);
      const key = dedupeKey(item);
      const seenAt = lastSeen.get(key);
      const duplicate = seenAt !== undefined && nowMs - seenAt <= windowMs;
      lastSeen.set(key, nowMs);
      return duplicate;
    },
  };
}
