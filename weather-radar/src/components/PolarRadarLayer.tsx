import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { ColorStop } from "@/lib/palPalette";
import type { PolarRenderResult } from "@/lib/renderPolar";

export interface PolarFrame {
  time: number;
  id: string;
}

interface Props<T extends PolarFrame> {
  frames: T[];
  frameIndex: number;
  opacity: number;
  stops: ColorStop[];
  loadFrame: (frame: T) => Promise<PolarRenderResult | null>;
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
  const cacheRef = useRef(new Map<string, PolarRenderResult>());
  const loadingRef = useRef(new Set<string>());
  const [cacheRev, bumpCache] = useState(0);

  const activeId = frames[frameIndex]?.id ?? null;

  useEffect(() => {
    stopsRef.current = stops;
    cacheRef.current.clear();
    loadingRef.current.clear();
    overlaysRef.current.forEach((ov) => ov.remove());
    overlaysRef.current.clear();
    bumpCache((n) => n + 1);
  }, [stops]);

  useEffect(() => {
    if (!frames.length) return;

    const queueFrame = (id: string, priority: boolean = false) => {
      if (cacheRef.current.has(id) || loadingRef.current.has(id)) return;
      const frame = frames.find((f) => f.id === id);
      if (!frame) return;
      loadingRef.current.add(id);
      loadFrame(frame)
        .then((result) => {
          if (result) {
            // Limit cache to 3 frames to reduce memory usage
            if (cacheRef.current.size >= 3) {
              const oldestKey = cacheRef.current.keys().next().value;
              if (oldestKey && oldestKey !== activeId) {
                cacheRef.current.delete(oldestKey);
                const overlay = overlaysRef.current.get(oldestKey);
                if (overlay) {
                  overlay.remove();
                  overlaysRef.current.delete(oldestKey);
                }
              }
            }
            cacheRef.current.set(id, result);
            bumpCache((n) => n + 1);
          }
        })
        .catch(() => {})
        .finally(() => {
          loadingRef.current.delete(id);
        });
    };

    // Load active frame immediately
    if (activeId) queueFrame(activeId, true);

    // Load adjacent frames with a small delay to prioritize active frame
    setTimeout(() => {
      for (let d = -1; d <= 1; d++) {
        if (d === 0) continue;
        const i = (frameIndex + d + frames.length) % frames.length;
        const f = frames[i];
        if (f) queueFrame(f.id, false);
      }
    }, 100);
  }, [frames, frameIndex, loadFrame, activeId]);

  useEffect(() => {
    overlaysRef.current.forEach((ov, id) => {
      ov.setOpacity(id === activeId ? opacity : 0);
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
