import { useState, useEffect } from "react";
import {
  fetchModelCrossSection,
  type CrossSectionData,
  type LatLng,
} from "@/lib/crossSection";
import { fetchRhiCrossSection } from "@/lib/rhiCrossSection";
import type { CrossSectionResult } from "@/components/CrossSectionPanel";
import type { RadarStation } from "@/data/stations";

export type CrossSectionKind = "ecmwf" | "radar";

export interface CrossSectionRequest {
  enabled: boolean;
  kind: CrossSectionKind;
  start: LatLng | null;
  end: LatLng | null;
  modelHourIndex: number;
  radar?: {
    station: RadarStation | null;
    productId?: string;
    dataSource?: "iem" | "level3" | "opera" | null;
    frameTime?: number;
    iemTmsId?: string;
  };
}

export function useCrossSectionData(request: CrossSectionRequest) {
  const [result, setResult] = useState<CrossSectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    enabled,
    kind,
    start,
    end,
    modelHourIndex,
    radar,
  } = request;

  useEffect(() => {
    if (!enabled || !start || !end) {
      setResult(null);
      setError(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (kind === "ecmwf") {
          const data: CrossSectionData = await fetchModelCrossSection(start, end, modelHourIndex);
          if (!cancelled) setResult({ kind: "ecmwf", data });
        } else {
          if (!radar?.station) {
            throw new Error("Select a radar station for cross-section");
          }
          const data = await fetchRhiCrossSection({
            start,
            end,
            station: radar.station,
            productId: radar.productId,
            dataSource: radar.dataSource,
            frameTime: radar.frameTime,
            iemTmsId: radar.iemTmsId,
          });
          if (!cancelled) setResult({ kind: "rhi", data });
        }
      } catch (e) {
        if (!cancelled) {
          setResult(null);
          setError(e instanceof Error ? e.message : "Cross-section failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    kind,
    start?.lat,
    start?.lon,
    end?.lat,
    end?.lon,
    modelHourIndex,
    radar?.station?.id,
    radar?.productId,
    radar?.dataSource,
    radar?.frameTime,
    radar?.iemTmsId,
  ]);

  return { result, loading, error };
}

export type { RadarStation };
