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

    const queueFrame = (id: string) => {
      if (cacheRef.current.has(id) || loadingRef.current.has(id)) return;
      const frame = frames.find((f) => f.id === id);
      if (!frame) return;
      loadingRef.current.add(id);
      loadFrame(frame)
        .then((result) => {
          if (result) {
            // Keep only 2 frames in cache: current and one other
            if (cacheRef.current.size >= 2) {
              // Find oldest non-active frame
              for (const [key, _] of cacheRef.current) {
                if (key !== activeId && key !== id) {
                  cacheRef.current.delete(key);
                  const overlay = overlaysRef.current.get(key);
                  if (overlay) {
                    overlay.remove();
                    overlaysRef.current.delete(key);
                  }
                  break;
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

    // Load only active frame immediately
    if (activeId) {
      queueFrame(activeId);
    }

    // Preload next frame when browser is idle
    const preloadNext = () => {
      const next = frames[(frameIndex + 1) % frames.length];
      if (next && next.id !== activeId) {
        queueFrame(next.id);
      }
    };

    const timeoutId = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(preloadNext, { timeout: 2000 });
      } else {
        preloadNext();
      }
    }, 300);

    return () => clearTimeout(timeoutId);
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
