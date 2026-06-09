import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { ColorStop } from "@/lib/palPalette";

export interface PolarFrame {
  time: number;
  id: string;
}

interface Props<T extends PolarFrame> {
  frames: T[];
  frameIndex: number;
  opacity: number;
  stops: ColorStop[];
  loadFrame: (frame: T) => Promise<{
    dataUrl: string;
    bounds: L.LatLngBoundsExpression;
  } | null>;
}

export default function PolarRadarLayer<T extends PolarFrame>({
  frames,
  frameIndex,
  opacity,
  stops,
  loadFrame,
}: Props<T>) {
  const map = useMap();
  const overlaysRef = useRef<Map<string, L.ImageOverlay>>(new Map());
  const stopsRef = useRef(stops);
  const cacheRef = useRef(
    new Map<string, { dataUrl: string; bounds: L.LatLngBoundsExpression }>(),
  );
  const [cacheRev, bumpCache] = useState(0);

  const activeId = frames[frameIndex]?.id ?? null;

  useEffect(() => {
    stopsRef.current = stops;
    cacheRef.current.clear();
    overlaysRef.current.forEach((ov) => ov.remove());
    overlaysRef.current.clear();
    bumpCache((n) => n + 1);
  }, [stops]);

  useEffect(() => {
    if (!frames.length) return;

    const preload = new Set<string>();
    for (let d = -2; d <= 2; d++) {
      const i = (frameIndex + d + frames.length) % frames.length;
      const f = frames[i];
      if (f) preload.add(f.id);
    }

    preload.forEach((id) => {
      if (cacheRef.current.has(id)) return;
      const frame = frames.find((f) => f.id === id);
      if (!frame) return;
      loadFrame(frame)
        .then((result) => {
          if (!result) return;
          cacheRef.current.set(id, result);
          bumpCache((n) => n + 1);
        })
        .catch(() => {});
    });
  }, [frames, frameIndex, loadFrame]);

  useEffect(() => {
    overlaysRef.current.forEach((ov, id) => {
      const active = id === activeId;
      ov.setOpacity(active ? opacity : 0);
    });

    if (!activeId || !cacheRef.current.has(activeId)) return;

    const { dataUrl, bounds } = cacheRef.current.get(activeId)!;
    let ov = overlaysRef.current.get(activeId);
    if (!ov) {
      ov = L.imageOverlay(dataUrl, bounds, { opacity, interactive: false, zIndex: 10 });
      ov.addTo(map);
      overlaysRef.current.set(activeId, ov);
    } else {
      ov.setUrl(dataUrl);
      ov.setBounds(bounds);
      ov.setOpacity(opacity);
    }
  }, [activeId, opacity, map, cacheRev]);

  useEffect(() => {
    return () => {
      overlaysRef.current.forEach((ov) => ov.remove());
      overlaysRef.current.clear();
    };
  }, [map]);

  return null;
}
