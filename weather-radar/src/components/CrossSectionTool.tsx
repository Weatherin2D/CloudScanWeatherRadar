import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { LatLng } from "@/lib/crossSection";

interface Props {
  active: boolean;
  start: LatLng | null;
  end: LatLng | null;
  onPoint: (point: LatLng) => void;
}

export default function CrossSectionTool({ active, start, end, onPoint }: Props) {
  useMapEvents({
    click(e) {
      if (!active) return;
      onPoint({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });

  const map = useMap();
  const lineRef = useRef<L.Polyline | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const capsRef = useRef<L.Polyline[]>([]);

  useEffect(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    capsRef.current.forEach((c) => c.remove());
    capsRef.current = [];
    lineRef.current?.remove();
    lineRef.current = null;

    if (!start && !end) return;

    const points: L.LatLngExpression[] = [];
    if (start) {
      const m = L.circleMarker([start.lat, start.lon], {
        radius: 6,
        color: "#fbbf24",
        fillColor: "#f59e0b",
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);
      markersRef.current.push(m);
      points.push([start.lat, start.lon]);
    }
    if (end) {
      const m = L.circleMarker([end.lat, end.lon], {
        radius: 6,
        color: "#fbbf24",
        fillColor: "#f59e0b",
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);
      markersRef.current.push(m);
      points.push([end.lat, end.lon]);
    }
    if (points.length === 2) {
      const line = L.polyline(points, {
        color: "#ffffff",
        weight: 2.5,
        opacity: 0.95,
      }).addTo(map);
      lineRef.current = line;

      // End caps (RadarScope-style)
      const capLen = 0.015; // degrees approx
      const [lat1, lon1] = points[0] as [number, number];
      const [lat2, lon2] = points[1] as [number, number];
      const dx = lon2 - lon1;
      const dy = lat2 - lat1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const px = (-dy / len) * capLen;
      const py = (dx / len) * capLen;

      const cap1 = L.polyline(
        [[lat1 - py, lon1 + px], [lat1 + py, lon1 - px]],
        { color: "#ffffff", weight: 2.5, opacity: 0.95 },
      ).addTo(map);
      const cap2 = L.polyline(
        [[lat2 - py, lon2 + px], [lat2 + py, lon2 - px]],
        { color: "#ffffff", weight: 2.5, opacity: 0.95 },
      ).addTo(map);
      capsRef.current.push(cap1, cap2);
    }

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      capsRef.current.forEach((c) => c.remove());
      capsRef.current = [];
      lineRef.current?.remove();
      lineRef.current = null;
    };
  }, [map, start, end]);

  return null;
}

export function MapBoundsReporter({
  onBoundsChange,
  onZoomChange,
}: {
  onBoundsChange: (bounds: { south: number; west: number; north: number; east: number }) => void;
  onZoomChange: (z: number) => void;
}) {
  const map = useMap();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const report = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const b = map.getBounds();
      onBoundsChange({
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      });
      onZoomChange(map.getZoom());
    }, 300);
  };

  useMapEvents({
    moveend: report,
    zoomend: report,
  });

  useEffect(() => {
    const b = map.getBounds();
    onBoundsChange({
      south: b.getSouth(),
      west: b.getWest(),
      north: b.getNorth(),
      east: b.getEast(),
    });
    onZoomChange(map.getZoom());
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [map]);

  return null;
}
