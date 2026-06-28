import { useState, useEffect } from "react";
import type { RadarStation } from "@/data/stations";
import {
  IEM_LATEST_FRAME,
  iemProductForTilt,
  iemRidgeSector,
  iemScanIsoToTms,
  isIemProductSupported,
  prefetchIemStationTiles,
  withLatestFrameAlias,
  type StationRadarFrame,
} from "@/lib/iemRadar";
import {
  getCachedIemFrames,
  iemFrameCacheKey,
  setCachedIemFrames,
} from "@/lib/iemFrameCache";
import {
  iemFastListingMinutes,
  iemListingMinutes,
  sliceRecentFrames,
} from "@/lib/radarFrameLimits";
import { STATION_RADAR_REFRESH_MS } from "@/lib/radarRefresh";
import { shouldUseIemFrames } from "@/lib/radarTilt";

const LIST_URL = "https://mesonet.agron.iastate.edu/json/radar.py";

function toIemIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function fetchIemFrameList(
  sector: string,
  product: string,
  listingMinutes: number,
): Promise<StationRadarFrame[]> {
  const end = toIemIso(new Date());
  const start = toIemIso(new Date(Date.now() - listingMinutes * 60 * 1000));
  const params = new URLSearchParams({
    operation: "list",
    radar: sector,
    product,
    start,
    end,
  });

  const r = await fetch(`${LIST_URL}?${params}`);
  const json = await r.json();
  const scans: { ts: string }[] = json.scans ?? [];
  return scans.map((scan) => ({
    time: Math.floor(new Date(scan.ts).getTime() / 1000),
    tmsId: iemScanIsoToTms(scan.ts),
  }));
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
    const enabled =
      shouldUseIemFrames(station?.country, uiProduct, tiltIndex)
      && !!station?.id
      && isIemProductSupported(iemProductForTilt(uiProduct, tiltIndex));

    if (!enabled || !station) {
      setFrames([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const sector = iemRidgeSector(station.id);
    const product = iemProductForTilt(uiProduct, tiltIndex);
    const cacheKey = iemFrameCacheKey(sector, product, frameCount);
    const cached = getCachedIemFrames(cacheKey);
    const fastMinutes = iemFastListingMinutes(frameCount);
    const fullMinutes = iemListingMinutes(frameCount);

    setFrames(cached ?? [IEM_LATEST_FRAME]);
    setLoading(!cached);

    prefetchIemStationTiles(station.id, product, station.lat, station.lon);

    const applyFrames = (raw: StationRadarFrame[]) => {
      const recent = withLatestFrameAlias(sliceRecentFrames(raw, frameCount));
      if (!recent.length) return;
      setCachedIemFrames(cacheKey, recent);
      setFrames(recent);
    };

    const load = async (initial: boolean) => {
      try {
        const fast = await fetchIemFrameList(sector, product, fastMinutes);
        if (cancelled) return;
        applyFrames(fast);

        if (fullMinutes > fastMinutes) {
          const full = await fetchIemFrameList(sector, product, fullMinutes);
          if (cancelled) return;
          applyFrames(full);
        }
      } catch {
        if (!cancelled && initial && !cached) {
          setFrames([IEM_LATEST_FRAME]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load(true);
    const timer = setInterval(() => load(false), STATION_RADAR_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [station?.id, station?.country, station?.lat, station?.lon, uiProduct, tiltIndex, frameCount]);

  return { frames, loading };
}
