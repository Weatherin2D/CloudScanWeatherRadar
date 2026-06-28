import { useState, useEffect } from "react";
import type { RadarStation } from "@/data/stations";
import {
  iemProductForTilt,
  iemRidgeSector,
  iemScanIsoToTms,
  isIemProductSupported,
  type StationRadarFrame,
} from "@/lib/iemRadar";
import { iemListingMinutes, sliceRecentFrames } from "@/lib/radarFrameLimits";
import { STATION_RADAR_REFRESH_MS } from "@/lib/radarRefresh";
import { shouldUseIemFrames } from "@/lib/radarTilt";

const LIST_URL = "https://mesonet.agron.iastate.edu/json/radar.py";

function toIemIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function useStationRadarFrames(
  station: RadarStation | null,
  uiProduct: string,
  tiltIndex: number,
  frameCount: number,
) {
  const [frames, setFrames] = useState<StationRadarFrame[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (
      !shouldUseIemFrames(station?.country, uiProduct, tiltIndex)
      || !station?.id
      || !isIemProductSupported(iemProductForTilt(uiProduct, tiltIndex))
    ) {
      setFrames([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const sector = iemRidgeSector(station.id);
    const product = iemProductForTilt(uiProduct, tiltIndex);
    const listingMinutes = iemListingMinutes(frameCount);

    const load = async (initial: boolean) => {
      if (initial) {
        setFrames([]);
        setLoading(true);
      }

      const end = toIemIso(new Date());
      const start = toIemIso(new Date(Date.now() - listingMinutes * 60 * 1000));
      const params = new URLSearchParams({
        operation: "list",
        radar: sector,
        product,
        start,
        end,
      });

      try {
        const r = await fetch(`${LIST_URL}?${params}`);
        const json = await r.json();
        if (cancelled) return;
        const scans: { ts: string }[] = json.scans ?? [];
        const recent = sliceRecentFrames(
          scans.map((scan) => ({
            time: Math.floor(new Date(scan.ts).getTime() / 1000),
            tmsId: iemScanIsoToTms(scan.ts),
          })),
          frameCount,
        );
        setFrames(recent);
      } catch {
        if (!cancelled && initial) setFrames([]);
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    };

    load(true);
    const timer = setInterval(() => load(false), STATION_RADAR_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [station?.id, station?.country, uiProduct, tiltIndex, frameCount]);

  return { frames, loading };
}
