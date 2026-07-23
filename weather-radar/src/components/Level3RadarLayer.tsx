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

const PREFETCH = 2;

/**
 * Station Level-III for all tilts/products: parse once, draw gates in map
 * pixel space so zoom quality matches RadarScope/WeatherWise study views.
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
  framesRef.current = frames;

  const activeKey = frames[frameIndex]?.key ?? frames.at(-1)?.key ?? null;
  const scope = frames[0]?.key?.split("_").slice(0, 2).join("_") ?? "";

  useEffect(() => {
    cacheRef.current.clear();
    setSweep(null);
  }, [scope]);

  useEffect(() => {
    if (!activeKey) {
      setSweep(null);
      return;
    }

    let cancelled = false;
    const cached = cacheRef.current.get(activeKey);
    if (cached) setSweep({ kind: "level3", parsed: cached });

    const loadOne = async (key: string) => {
      const hit = cacheRef.current.get(key);
      if (hit) return hit;
      const parsed = await loadParsedLevel3(key, level3ObjectUrl(key));
      if (parsed) cacheRef.current.set(key, parsed);
      return parsed;
    };

    const run = async () => {
      const parsed = await loadOne(activeKey);
      if (cancelled) return;
      setSweep(parsed ? { kind: "level3", parsed } : null);

      const list = framesRef.current;
      const idx = list.findIndex((f) => f.key === activeKey);
      if (idx < 0) return;
      for (const delta of [1, -1, 2, -2].slice(0, PREFETCH * 2)) {
        const frame = list[(idx + delta + list.length) % list.length];
        if (!frame || cacheRef.current.has(frame.key)) continue;
        void loadOne(frame.key);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeKey, frames]);

  return (
    <PolarSweepCanvasLayer
      sweep={sweep}
      opacity={opacity}
      stops={stops}
      reflectivity={reflectivity}
      reflectivityFade={reflectivityFade}
    />
  );
}
