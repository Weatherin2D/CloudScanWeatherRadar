import type { StationRadarFrame } from "@/lib/iemRadar";

const CACHE_TTL_MS = 2 * 60 * 1000;

interface CacheEntry {
  frames: StationRadarFrame[];
  at: number;
}

const cache = new Map<string, CacheEntry>();

export function iemFrameCacheKey(
  sector: string,
  product: string,
  frameCount: number,
): string {
  return `${sector}:${product}:${frameCount}`;
}

export function getCachedIemFrames(key: string): StationRadarFrame[] | null {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at > CACHE_TTL_MS) return null;
  return hit.frames;
}

export function setCachedIemFrames(key: string, frames: StationRadarFrame[]): void {
  if (!frames.length) return;
  cache.set(key, { frames, at: Date.now() });
}
