import { useState, useEffect } from "react";
import { fetchGlobalWeatherAlerts, type WeatherAlertRecord } from "@/lib/weatherAlerts";
import { EMPTY_GEOJSON, type GeoJsonFeatureCollection } from "@/lib/geoJson";

export interface WeatherAlertsData {
  geojson: GeoJsonFeatureCollection;
  alerts: WeatherAlertRecord[];
  source: string;
  featureCount: number;
  updatedAt: number;
}

const REFRESH_MS = 5 * 60 * 1000;

export function useWeatherAlerts(enabled: boolean) {
  const [data, setData] = useState<WeatherAlertsData | null>(null);
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
        const result = await fetchGlobalWeatherAlerts();
        if (cancelled) return;
        setData({
          geojson: result.geojson,
          alerts: result.alerts,
          source: result.source,
          featureCount: result.geojson.features.length,
          updatedAt: Date.now(),
        });
      } catch (e) {
        if (!cancelled) {
          setData({
            geojson: EMPTY_GEOJSON,
            alerts: [],
            source: "",
            featureCount: 0,
            updatedAt: Date.now(),
          });
          setError(e instanceof Error ? e.message : "Failed to load alerts");
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
  }, [enabled]);

  return { data, loading, error };
}
