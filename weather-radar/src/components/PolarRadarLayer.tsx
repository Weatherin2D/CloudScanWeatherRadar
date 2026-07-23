import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { ColorStop } from "@/lib/palPalette";
import type { PolarRenderResult } from "@/lib/renderPolar";

export interface PolarFrame {
  time: number;
  id: string;
}

export type PolarLoadQuality = "preview" | "study";

interface Props<T extends PolarFrame> {
  frames: T[];
  frameIndex: number;
  opacity: number;
  stops: ColorStop[];
  loadFrame: (
    frame: T,
    quality?: PolarLoadQuality,
  ) => Promise<PolarRenderResult | null>;
}

const PREFETCH_AFTER_FIRST = 2;
const OVERLAY_CLASS = "radar-polar-overlay";

export default function PolarRadarLayer<T extends PolarFrame>({
  frames,
  frameIndex,
  opacity,
  stops,
  loadFrame,
}: Props<T>) {
  const map = useMap();
  const overlaysRef = useRef<Map<string, L.ImageOverlay>>(new Map());
  const cacheRef = useRef(new Map<string, PolarRenderResult>());
  const loadFrameRef = useRef(loadFrame);
  const framesRef = useRef(frames);
  const activeIdRef = useRef<string | null>(null);
  const lastShownIdRef = useRef<string | null>(null);
  const prefetchGenRef = useRef(0);
  const studyGenRef = useRef(0);
  const [cacheRev, bumpCache] = useState(0);

  loadFrameRef.current = loadFrame;
  framesRef.current = frames;

  const activeId = frames[frameIndex]?.id ?? null;
  activeIdRef.current = activeId;

  const frameScope = frames[0]?.id?.split("_").slice(0, 2).join("_") ?? frames[0]?.id ?? "";

  const clearLocalCache = () => {
    cacheRef.current.clear();
    overlaysRef.current.forEach((ov) => ov.remove());
    overlaysRef.current.clear();
    lastShownIdRef.current = null;
    bumpCache((n) => n + 1);
  };

  useEffect(() => {
    clearLocalCache();
  }, [stops]);

  useEffect(() => {
    clearLocalCache();
  }, [frameScope]);

  // Active-first preview: concurrency 1 until first frame paints, then warm neighbors.
  useEffect(() => {
    if (!frames.length) return;
    const gen = ++prefetchGenRef.current;
    let running = 0;
    let firstReady = false;
    let concurrency = 1;
    const queue: string[] = [];
    const queued = new Set<string>();
    const inFlight = new Set<string>();

    const enqueue = (id: string | undefined) => {
      if (!id || queued.has(id) || cacheRef.current.has(id)) return;
      queued.add(id);
      queue.push(id);
    };

    const enqueueBackground = () => {
      const list = framesRef.current;
      if (!list.length) return;
      const activeIdx = list.findIndex((f) => f.id === activeIdRef.current);
      const order: number[] = [];
      if (activeIdx >= 0) {
        order.push(activeIdx + 1, activeIdx - 1);
        for (let i = 0; i < list.length; i++) order.push(i);
      } else {
        for (let i = 0; i < list.length; i++) order.push(i);
      }
      const seen = new Set<number>();
      for (const raw of order) {
        const idx = ((raw % list.length) + list.length) % list.length;
        if (seen.has(idx)) continue;
        seen.add(idx);
        enqueue(list[idx]?.id);
      }
    };

    const pump = () => {
      if (gen !== prefetchGenRef.current) return;
      while (running < concurrency && queue.length > 0) {
        const id = queue.shift()!;
        if (cacheRef.current.has(id) || inFlight.has(id)) continue;

        const frame = framesRef.current.find((f) => f.id === id);
        if (!frame) continue;

        running++;
        inFlight.add(id);

        loadFrameRef
          .current(frame, "preview")
          .then((result) => {
            if (gen !== prefetchGenRef.current || !result?.dataUrl) return;
            const existing = cacheRef.current.get(id);
            // Never replace study-quality with a later preview.
            if (existing?.quality === "study") return;
            cacheRef.current.set(id, result);
            bumpCache((n) => n + 1);

            if (!firstReady && id === activeIdRef.current) {
              firstReady = true;
              concurrency = PREFETCH_AFTER_FIRST;
              enqueueBackground();
            }
          })
          .catch(() => {})
          .finally(() => {
            inFlight.delete(id);
            running--;
            if (gen !== prefetchGenRef.current) return;
            const active = activeIdRef.current;
            if (active && !cacheRef.current.has(active) && !queued.has(active)) {
              queue.unshift(active);
              queued.add(active);
            }
            if (!firstReady && active && cacheRef.current.has(active)) {
              firstReady = true;
              concurrency = PREFETCH_AFTER_FIRST;
              enqueueBackground();
            }
            pump();
          });
      }
    };

    enqueue(activeIdRef.current ?? frames[frames.length - 1]?.id);
    const active = activeIdRef.current;
    if (active && cacheRef.current.has(active)) {
      firstReady = true;
      concurrency = PREFETCH_AFTER_FIRST;
      enqueueBackground();
    }
    pump();

    return () => {
      if (prefetchGenRef.current === gen) prefetchGenRef.current++;
    };
  }, [frames, loadFrame]);

  // Upgrade the visible frame to study quality after preview is on screen.
  useEffect(() => {
    if (!activeId) return;
    const existing = cacheRef.current.get(activeId);
    if (existing?.quality === "study") {
      bumpCache((n) => n + 1);
      return;
    }

    const frame = frames.find((f) => f.id === activeId);
    if (!frame) return;
    const gen = ++studyGenRef.current;

    // Ensure preview is loading/shown, then upgrade.
    const run = async () => {
      if (!cacheRef.current.has(activeId)) {
        const preview = await loadFrameRef.current(frame, "preview");
        if (gen !== studyGenRef.current || !preview?.dataUrl) return;
        if (cacheRef.current.get(activeId)?.quality !== "study") {
          cacheRef.current.set(activeId, preview);
          bumpCache((n) => n + 1);
        }
      }

      const study = await loadFrameRef.current(frame, "study");
      if (gen !== studyGenRef.current || !study?.dataUrl) return;
      if (activeIdRef.current !== activeId) return;
      cacheRef.current.set(activeId, study);
      bumpCache((n) => n + 1);
    };

    void run();
  }, [activeId, frames]);

  useEffect(() => {
    // Hold last ready frame while active is still loading (no blank flash).
    const showId =
      (activeId && cacheRef.current.has(activeId) ? activeId : null) ??
      (lastShownIdRef.current && cacheRef.current.has(lastShownIdRef.current)
        ? lastShownIdRef.current
        : null);

    overlaysRef.current.forEach((ov, id) => {
      ov.setOpacity(id === showId ? opacity : 0);
    });

    if (!showId) return;

    const cached = cacheRef.current.get(showId);
    if (!cached) return;

    const { dataUrl, bounds } = cached;
    let ov = overlaysRef.current.get(showId);
    if (!ov) {
      ov = L.imageOverlay(dataUrl, L.latLngBounds(bounds), {
        opacity,
        interactive: false,
        zIndex: 10,
        className: OVERLAY_CLASS,
      });
      ov.addTo(map);
      overlaysRef.current.set(showId, ov);
    } else {
      const el = ov.getElement();
      if (!el || el.getAttribute("src") !== dataUrl) {
        ov.setUrl(dataUrl);
      }
      ov.setBounds(L.latLngBounds(bounds));
      ov.setOpacity(opacity);
      const img = ov.getElement();
      if (img && !img.classList.contains(OVERLAY_CLASS)) {
        img.classList.add(OVERLAY_CLASS);
      }
    }

    if (activeId && cacheRef.current.has(activeId)) {
      lastShownIdRef.current = activeId;
    } else if (showId) {
      lastShownIdRef.current = showId;
    }
  }, [activeId, opacity, map, cacheRev]);

  useEffect(() => {
    return () => {
      overlaysRef.current.forEach((ov) => ov.remove());
      overlaysRef.current.clear();
      cacheRef.current.clear();
    };
  }, [map]);

  return null;
}
