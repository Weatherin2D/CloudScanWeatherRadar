import type { PolarRenderResult } from "./renderPolar";
import { revokePolarUrl } from "./renderPolar";

const MAX_ENTRIES = 32;

interface CacheEntry {
  result: PolarRenderResult;
  /** Touch order for LRU. */
  seq: number;
}

const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<PolarRenderResult | null>>();
let seq = 0;

function touch(key: string, entry: CacheEntry): void {
  entry.seq = ++seq;
  // Re-insert to keep Map iteration roughly LRU-friendly
  store.delete(key);
  store.set(key, entry);
}

function evictIfNeeded(): void {
  while (store.size > MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestSeq = Infinity;
    for (const [key, entry] of store) {
      if (entry.seq < oldestSeq) {
        oldestSeq = entry.seq;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    const removed = store.get(oldestKey);
    store.delete(oldestKey);
    revokePolarUrl(removed?.result);
  }
}

export function getCachedPolarFrame(key: string): PolarRenderResult | null {
  const entry = store.get(key);
  if (!entry) return null;
  touch(key, entry);
  return entry.result;
}

export function setCachedPolarFrame(key: string, result: PolarRenderResult): void {
  const prev = store.get(key);
  if (prev && prev.result.dataUrl !== result.dataUrl) {
    revokePolarUrl(prev.result);
  }
  store.set(key, { result, seq: ++seq });
  evictIfNeeded();
}

/** Dedup concurrent loads for the same cache key. */
export async function loadPolarFrameCached(
  key: string,
  loader: () => Promise<PolarRenderResult | null>,
): Promise<PolarRenderResult | null> {
  const hit = getCachedPolarFrame(key);
  if (hit) return hit;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const result = await loader();
      if (result?.dataUrl) {
        setCachedPolarFrame(key, result);
      }
      return result;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/** Drop entries whose key starts with prefix (station/product change). */
export function clearPolarFrameCache(prefix?: string): void {
  if (!prefix) {
    for (const entry of store.values()) {
      revokePolarUrl(entry.result);
    }
    store.clear();
    inflight.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) {
      const entry = store.get(key);
      store.delete(key);
      revokePolarUrl(entry?.result);
    }
  }
  for (const key of [...inflight.keys()]) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}
