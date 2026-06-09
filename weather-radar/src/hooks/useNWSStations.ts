import { useState, useEffect } from "react";
import type { RadarStation } from "@/data/stations";

interface NWSStation {
  properties: {
    id?: string;
    stationIdentifier?: string;
    name: string;
    stationType: string;
    elevation?: { value: number };
  };
  geometry: {
    coordinates: [number, number];
  };
}

const CACHE_KEY = "nws_stations_v2";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export function useNWSStations() {
  const [stations, setStations] = useState<RadarStation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try cache first
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) {
          const valid = (data as RadarStation[]).filter((s) => s.id);
          if (valid.length > 0) {
            setStations(valid);
            setLoading(false);
            return;
          }
        }
      }
    } catch {}

    fetch("https://api.weather.gov/radar/stations", {
      headers: { "User-Agent": "WeatherRadarApp/1.0" },
    })
      .then((r) => r.json())
      .then((json) => {
        const nexrad: RadarStation[] = (json.features ?? [])
          .filter((f: NWSStation) => f.properties.stationType === "WSR-88D")
          .map((f: NWSStation) => ({
            id: f.properties.id ?? f.properties.stationIdentifier ?? "",
            name: f.properties.name,
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
            country: "us" as const,
            countryCode: "us",
            elevation: f.properties.elevation?.value ?? 0,
          }))
          .filter((s) => s.id.length > 0);
        setStations(nexrad);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data: nexrad, ts: Date.now() }));
        } catch {}
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { stations, loading };
}
