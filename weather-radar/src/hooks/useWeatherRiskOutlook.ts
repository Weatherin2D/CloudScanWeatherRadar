import { useState, useEffect } from "react";
import {
  fetchConvectiveRiskOutlook,
  type ConvectiveRiskOutlook,
  type OutlookDay,
} from "@/lib/convectiveRisk";

export type { ConvectiveRiskOutlook as WeatherRiskOutlook };

const REFRESH_MS = 15 * 60 * 1000;

const EMPTY_OUTLOOK: ConvectiveRiskOutlook = {
  geojson: { type: "FeatureCollection", features: [] },
  issueTime: null,
  validTime: null,
  expireTime: null,
  forecaster: null,
  sources: [],
  featureCounts: { spc: 0, mesocast: 0, europe: 0 },
};

export function useWeatherRiskOutlook(enabled: boolean, day: OutlookDay) {
  const [outlook, setOutlook] = useState<ConvectiveRiskOutlook | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setError(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchConvectiveRiskOutlook(day);
        if (cancelled) return;
        setOutlook(result);
      } catch (e) {
        if (!cancelled) {
          setOutlook(EMPTY_OUTLOOK);
          setError(e instanceof Error ? e.message : "Failed to load convective risk");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, day]);

  return { outlook, loading, error };
}
