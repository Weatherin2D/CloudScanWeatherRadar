import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";

export interface MapViewState {
  lat: number;
  lon: number;
  zoom: number;
}

interface Props {
  view: MapViewState;
  onViewChange: (view: MapViewState) => void;
  /** When false, this pane only follows external view changes. */
  interactive?: boolean;
}

/** Keeps multiple Leaflet maps synced to the same center and zoom. */
export default function MapViewSync({ view, onViewChange, interactive = true }: Props) {
  const map = useMap();
  const syncingRef = useRef(false);
  const lastViewRef = useRef(view);

  useEffect(() => {
    const last = lastViewRef.current;
    if (
      Math.abs(last.lat - view.lat) < 1e-7 &&
      Math.abs(last.lon - view.lon) < 1e-7 &&
      last.zoom === view.zoom
    ) {
      return;
    }
    lastViewRef.current = view;
    syncingRef.current = true;
    map.setView([view.lat, view.lon], view.zoom, { animate: false });
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  }, [map, view.lat, view.lon, view.zoom]);

  useMapEvents({
    moveend: () => {
      if (!interactive || syncingRef.current) return;
      const c = map.getCenter();
      const next = { lat: c.lat, lon: c.lng, zoom: map.getZoom() };
      lastViewRef.current = next;
      onViewChange(next);
    },
    zoomend: () => {
      if (!interactive || syncingRef.current) return;
      const c = map.getCenter();
      const next = { lat: c.lat, lon: c.lng, zoom: map.getZoom() };
      lastViewRef.current = next;
      onViewChange(next);
    },
  });

  return null;
}
