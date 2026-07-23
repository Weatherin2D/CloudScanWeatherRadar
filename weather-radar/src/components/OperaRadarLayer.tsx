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

const PREFETCH = 2;
const scanCache = new Map<string, OdimScanMeta>();
const MAX_SCAN_CACHE = 20;

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
  framesRef.current = frames;

  const activeUrl = frames[frameIndex]?.odimUrl ?? frames.at(-1)?.odimUrl ?? null;

  useEffect(() => {
    if (!activeUrl) {
      setSweep(null);
      return;
    }

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

    const run = async () => {
      const scan = await loadOne(activeUrl);
      if (cancelled) return;
      if (scan) setSweep({ kind: "opera", scan });
      else setSweep(null);

      const list = framesRef.current;
      const idx = list.findIndex((f) => f.odimUrl === activeUrl);
      if (idx < 0) return;
      for (const delta of [1, -1, 2, -2].slice(0, PREFETCH * 2)) {
        const frame = list[(idx + delta + list.length) % list.length];
        if (!frame || scanCache.has(frame.odimUrl)) continue;
        void loadOne(frame.odimUrl);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeUrl, station.lat, station.lon, frames]);

  useEffect(() => {
    setSweep(null);
  }, [station.id]);

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
