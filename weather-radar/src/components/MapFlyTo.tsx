import { useEffect } from "react";
import { useMap } from "react-leaflet";
import type { RadarStation } from "@/data/stations";

interface Props {
  station: RadarStation | null;
  zoom?: number;
}

export default function MapFlyTo({ station, zoom = 7 }: Props) {
  const map = useMap();

  useEffect(() => {
    if (!station) return;
    map.flyTo([station.lat, station.lon], zoom, { duration: 0.8 });
  }, [station, zoom, map]);

  return null;
}
