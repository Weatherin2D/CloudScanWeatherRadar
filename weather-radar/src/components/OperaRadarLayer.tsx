import { useEffect, useRef, useState } from "react";
import type { RadarStation } from "@/data/stations";
import type { ColorStop, ReflectivityFadeSettings } from "@/lib/palPalette";
import { loadOdimScan, type OperaFrame } from "@/lib/operaRadar";
import type { OdimScanMeta } from "@/lib/renderPolar";
import PolarSweepCanvasLayer, { type PolarSweepData } from "./PolarSweepCanvasLayer";

interface Props {
  station: RadarStation;
  frames: OperaFrame[];
  frameIndex: number;
  opacity: number;
  stops: ColorStop[];
  reflectivity?: boolean;
  reflectivityFade?: ReflectivityFadeSettings;
}

const PREFETCH_CONCURRENCY = 2;
const scanCache = new Map<string, OdimScanMeta>();
const MAX_SCAN_CACHE = 24;

function cacheScan(url: string, scan: OdimScanMeta) {
  scanCache.set(url, scan);
  while (scanCache.size > MAX_SCAN_CACHE) {
    const first = scanCache.keys().next().value;
    if (first == null) break;
    scanCache.delete(first);
  }
}

export default function OperaRadarLayer({
  station,
  frames,
  frameIndex,
  opacity,
  stops,
  reflectivity = true,
  reflectivityFade,
}: Props) {
  const [sweep, setSweep] = useState<PolarSweepData | null>(null);
  const framesRef = useRef(frames);
  const lastGoodRef = useRef<PolarSweepData | null>(null);
  framesRef.current = frames;

  const activeUrl = frames[frameIndex]?.odimUrl ?? frames.at(-1)?.odimUrl ?? null;

  useEffect(() => {
    // Keep last frame until the new station's first scan arrives
  }, [station.id]);

  useEffect(() => {
    if (!activeUrl) return;

    let cancelled = false;

    const loadOne = async (url: string) => {
      const hit = scanCache.get(url);
      if (hit) return hit;
      try {
        const scan = await loadOdimScan(url, station.lat, station.lon);
        if (scan) cacheScan(url, scan);
        return scan;
      } catch {
        return null;
      }
    };

    const show = (scan: OdimScanMeta) => {
      const next: PolarSweepData = { kind: "opera", scan };
      lastGoodRef.current = next;
      setSweep(next);
    };

    const cached = scanCache.get(activeUrl);
    if (cached) show(cached);
    else if (lastGoodRef.current) setSweep(lastGoodRef.current);

    const run = async () => {
      const scan = await loadOne(activeUrl);
      if (cancelled) return;
      if (scan) show(scan);

      const list = framesRef.current;
      const idx = list.findIndex((f) => f.odimUrl === activeUrl);
      const order: string[] = [];
      if (idx >= 0) {
        for (const d of [1, -1, 2, -2]) {
          const f = list[(idx + d + list.length) % list.length];
          if (f) order.push(f.odimUrl);
        }
        for (const f of list) {
          if (!order.includes(f.odimUrl)) order.push(f.odimUrl);
        }
      }

      let cursor = 0;
      let running = 0;
      const pump = () => {
        if (cancelled) return;
        while (running < PREFETCH_CONCURRENCY && cursor < order.length) {
          const url = order[cursor++]!;
          if (scanCache.has(url)) continue;
          running++;
          void loadOne(url).finally(() => {
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
  }, [activeUrl, station.lat, station.lon, frames]);

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
