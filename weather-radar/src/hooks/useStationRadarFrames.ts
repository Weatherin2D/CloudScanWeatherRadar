import { useState, useEffect } from "react";
import type { RadarStation } from "@/data/stations";
import {
  STATION_RADAR_FRAME_COUNT,
  iemProductId,
  iemRidgeSector,
  iemScanIsoToTms,
  isIemProductSupported,
  type StationRadarFrame,
} from "@/lib/iemRadar";

const LIST_URL = "https://mesonet.agron.iastate.edu/json/radar.py";

function toIemIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function useStationRadarFrames(
  station: RadarStation | null,
  uiProduct: string,
) {
  const [frames, setFrames] = useState<StationRadarFrame[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!station?.id || station.country !== "us" || !isIemProductSupported(uiProduct)) {
      setFrames([]);
      setLoading(false);
      return;
    }

    const sector = iemRidgeSector(station.id);
    const product = iemProductId(uiProduct);
    const end = toIemIso(new Date());
    const start = toIemIso(new Date(Date.now() - 3 * 60 * 60 * 1000));

    setFrames([]);
    setLoading(true);
    const params = new URLSearchParams({
      operation: "list",
      radar: sector,
      product,
      start,
      end,
    });

    fetch(`${LIST_URL}?${params}`)
      .then((r) => r.json())
      .then((json) => {
        const scans: { ts: string }[] = json.scans ?? [];
        const recent = scans.slice(-STATION_RADAR_FRAME_COUNT).map((scan) => ({
          time: Math.floor(new Date(scan.ts).getTime() / 1000),
          tmsId: iemScanIsoToTms(scan.ts),
        }));
        setFrames(recent);
      })
      .catch(() => setFrames([]))
      .finally(() => setLoading(false));
  }, [station?.id, station?.country, uiProduct]);

  return { frames, loading };
}
