import { useEffect } from "react";
import { useMap } from "react-leaflet";
import type { RadarStation } from "@/data/stations";

interface Props {
  station?: RadarStation | null;
  target?: { lat: number; lon: number } | null;
  zoom?: number;
  /** Jump instantly instead of animating — radar tiles load sooner. */
  instant?: boolean;
}

export default function MapFlyTo({ station, target, zoom = 8, instant = false }: Props) {
  const map = useMap();

  useEffect(() => {
    if (station) {
      const center: [number, number] = [station.lat, station.lon];
      if (instant) {
        map.setView(center, zoom, { animate: false });
      } else {
        map.flyTo(center, zoom, { duration: 0.8 });
      }
      return;
    }
    if (target) {
      const center: [number, number] = [target.lat, target.lon];
      if (instant) {
        map.setView(center, zoom, { animate: false });
      } else {
        map.flyTo(center, zoom, { duration: 0.8 });
      }
    }
  }, [station, target, zoom, instant, map]);

  return null;
}
