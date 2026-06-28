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
    let cancelled = false;

    const queueFrame = async (id: string) => {
      if (cacheRef.current.has(id) || loadingRef.current.has(id)) return;
      const frame = frames.find((f) => f.id === id);
      if (!frame) return;
      
      loadingRef.current.add(id);
      
      try {
        const result = await loadFrame(frame);
        if (cancelled || !result) return;
        
        const maxCached = 4;
        if (cacheRef.current.size >= maxCached) {
          for (const key of [...cacheRef.current.keys()]) {
            if (key === id) continue;
            cacheRef.current.delete(key);
            overlaysRef.current.get(key)?.remove();
            overlaysRef.current.delete(key);
            if (cacheRef.current.size < maxCached) break;
          }
        }
        
        cacheRef.current.set(id, result);
        bumpCache((n) => n + 1);
      } catch {
        // Ignore errors
      } finally {
        loadingRef.current.delete(id);
      }
    };

    // Preload adjacent frames for animation
    const activeIdx = frames.findIndex((f) => f.id === activeId);
    if (activeIdx >= 0) {
      const neighbors = [activeIdx, activeIdx + 1, activeIdx - 1];
      for (const idx of neighbors) {
        const frame = frames[(idx + frames.length) % frames.length];
        if (frame) queueFrame(frame.id);
      }
    } else if (activeId) {
      queueFrame(activeId);
    }

    return () => {
      cancelled = true;
    };
  }, [frames, loadFrame, activeId]);

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
