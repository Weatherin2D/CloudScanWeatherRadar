import { useEffect, useRef, useState } from "react";
import type { ColorStop, ReflectivityFadeSettings } from "@/lib/palPalette";
import { level3ObjectUrl, type Level3Frame } from "@/lib/level3Radar";
import { loadParsedLevel3 } from "@/lib/level3ParsedCache";
import type { Level3Parsed } from "@/lib/level3Parse";
import PolarSweepCanvasLayer, { type PolarSweepData } from "./PolarSweepCanvasLayer";

interface Props {
  frames: Level3Frame[];
  frameIndex: number;
  opacity: number;
  stops: ColorStop[];
  reflectivity?: boolean;
  reflectivityFade?: ReflectivityFadeSettings;
}

const PREFETCH_CONCURRENCY = 2;

/**
 * Station Level-III: parse/cache sweeps and draw in map space.
 * Holds the last good frame so imagery never blanks while the next loads.
 */
export default function Level3RadarLayer({
  frames,
  frameIndex,
  opacity,
  stops,
  reflectivity = false,
  reflectivityFade,
}: Props) {
  const [sweep, setSweep] = useState<PolarSweepData | null>(null);
  const cacheRef = useRef(new Map<string, Level3Parsed>());
  const framesRef = useRef(frames);
  const lastGoodRef = useRef<PolarSweepData | null>(null);
  framesRef.current = frames;

  const activeKey = frames[frameIndex]?.key ?? frames.at(-1)?.key ?? null;
  const scope = frames[0]?.key?.split("_").slice(0, 2).join("_") ?? "";

  useEffect(() => {
    cacheRef.current.clear();
    // Keep lastGood visible across product/station until first new frame arrives
  }, [scope]);

  useEffect(() => {
    if (!activeKey) return;

    let cancelled = false;

    const loadOne = async (key: string) => {
      const hit = cacheRef.current.get(key);
      if (hit) return hit;
      const parsed = await loadParsedLevel3(key, level3ObjectUrl(key));
      if (parsed) cacheRef.current.set(key, parsed);
      return parsed;
    };

    const show = (parsed: Level3Parsed) => {
      const next: PolarSweepData = { kind: "level3", parsed };
      lastGoodRef.current = next;
      setSweep(next);
    };

    const cached = cacheRef.current.get(activeKey);
    if (cached) show(cached);
    else if (lastGoodRef.current) setSweep(lastGoodRef.current);

    const run = async () => {
      const parsed = await loadOne(activeKey);
      if (cancelled) return;
      if (parsed) show(parsed);

      // Prefetch full timeline with limited concurrency
      const list = framesRef.current;
      const idx = list.findIndex((f) => f.key === activeKey);
      const order: string[] = [];
      if (idx >= 0) {
        for (const d of [1, -1, 2, -2, 3, -3]) {
          const f = list[(idx + d + list.length) % list.length];
          if (f) order.push(f.key);
        }
        for (const f of list) {
          if (!order.includes(f.key)) order.push(f.key);
        }
      } else {
        for (const f of list) order.push(f.key);
      }

      let cursor = 0;
      let running = 0;
      const pump = () => {
        if (cancelled) return;
        while (running < PREFETCH_CONCURRENCY && cursor < order.length) {
          const key = order[cursor++]!;
          if (cacheRef.current.has(key)) continue;
          running++;
          void loadOne(key).finally(() => {
            running--;
            pump();
          });
        }
      };
      pump();
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeKey, frames]);

  return (
    <PolarSweepCanvasLayer
      sweep={sweep ?? lastGoodRef.current}
      opacity={opacity}
      stops={stops}
      reflectivity={reflectivity}
      reflectivityFade={reflectivityFade}
    />
  );
}
