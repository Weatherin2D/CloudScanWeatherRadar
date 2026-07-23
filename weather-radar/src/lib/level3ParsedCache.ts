import type { Level3Parsed } from "./level3Parse";
import { parseLevel3 } from "./level3Parse";

const MAX_PARSED = 24;
const store = new Map<string, { parsed: Level3Parsed; seq: number }>();
const inflight = new Map<string, Promise<Level3Parsed | null>>();
let seq = 0;

function evict(): void {
  while (store.size > MAX_PARSED) {
    let oldestKey: string | null = null;
    let oldestSeq = Infinity;
    for (const [key, entry] of store) {
      if (entry.seq < oldestSeq) {
        oldestSeq = entry.seq;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    store.delete(oldestKey);
  }
}

/** Fetch + parse Level-III once; reuse for preview and study-quality rasters. */
export async function loadParsedLevel3(
  key: string,
  objectUrl: string,
): Promise<Level3Parsed | null> {
  const hit = store.get(key);
  if (hit) {
    hit.seq = ++seq;
    return hit.parsed;
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const res = await fetch(objectUrl);
      if (!res.ok) return null;
      const parsed = await parseLevel3(await res.arrayBuffer());
      if (!parsed) return null;
      store.set(key, { parsed, seq: ++seq });
      evict();
      return parsed;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}
