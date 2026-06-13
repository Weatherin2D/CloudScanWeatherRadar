import { useState, useEffect } from "react";
import { fetchGlobalRadarFrames, type GlobalRadarFrame } from "@/lib/globalRadar";
import { RAINVIEWER_REFRESH_MS } from "@/lib/radarRefresh";

export function useGlobalRadarFrames(frameCount: number) {
  const [frames, setFrames] = useState<GlobalRadarFrame[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async (initial: boolean) => {
      if (initial) {
        setFrames([]);
        setLoading(true);
      }

      try {
        const next = await fetchGlobalRadarFrames(frameCount);
        if (!cancelled) setFrames(next);
      } catch {
        if (!cancelled && initial) setFrames([]);
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    };

    load(true);
    const timer = setInterval(() => load(false), RAINVIEWER_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [frameCount]);

  return { frames, loading };
}
