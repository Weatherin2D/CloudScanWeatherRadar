import { useEffect, useMemo, useRef, useState } from "react";
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

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

/**
 * Stable ImageOverlay polar layer:
 * - never blanks while the next frame/URL loads
 * - prefetch does not cancel in-flight work when the frame list refreshes
 * - preview first, then idle study upgrade
 */
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
  const displayUrlRef = useRef<Map<string, string>>(new Map());
  const studyGenRef = useRef(0);
  const unmountedRef = useRef(false);
  const [cacheRev, bumpCache] = useState(0);

  loadFrameRef.current = loadFrame;
  framesRef.current = frames;

  const activeId = frames[frameIndex]?.id ?? null;
  activeIdRef.current = activeId;

  const frameScope =
    frames[0]?.id?.split("_").slice(0, 2).join("_") ?? frames[0]?.id ?? "";

  const frameIdsKey = useMemo(
    () => frames.map((f) => f.id).join("\n"),
    [frames],
  );

  const clearOverlaysOnly = () => {
    overlaysRef.current.forEach((ov) => ov.remove());
    overlaysRef.current.clear();
    displayUrlRef.current.clear();
    lastShownIdRef.current = null;
  };

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  useEffect(() => {
    cacheRef.current.clear();
    clearOverlaysOnly();
    bumpCache((n) => n + 1);
  }, [stops, frameScope]);

  // Prefetch: do not cancel on frame-list refresh — only add new work.
  useEffect(() => {
    if (!frames.length) return;

    let running = 0;
    let concurrency = 1;
    const queue: string[] = [];
    const queued = new Set<string>();
    const inFlight = new Set<string>();
    let alive = true;

    const enqueue = (id: string | undefined) => {
      if (!id || queued.has(id) || cacheRef.current.has(id) || inFlight.has(id)) {
        return;
      }
      queued.add(id);
      queue.push(id);
    };

    const pump = () => {
      if (!alive) return;
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
            if (!alive || unmountedRef.current || !result?.dataUrl) return;
            const existing = cacheRef.current.get(id);
            if (existing?.quality === "study") return;
            cacheRef.current.set(id, result);
            bumpCache((n) => n + 1);
            if (id === activeIdRef.current) {
              concurrency = PREFETCH_AFTER_FIRST;
            }
          })
          .catch(() => {})
          .finally(() => {
            inFlight.delete(id);
            running--;
            if (!alive) return;
            const active = activeIdRef.current;
            if (active && !cacheRef.current.has(active) && !queued.has(active)) {
              queue.unshift(active);
              queued.add(active);
            }
            pump();
          });
      }
    };

    const list = frames;
    const activeIdx = list.findIndex((f) => f.id === activeIdRef.current);
    const order: number[] = [];
    if (activeIdx >= 0) {
      order.push(activeIdx, activeIdx + 1, activeIdx - 1);
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

    if (activeIdRef.current && cacheRef.current.has(activeIdRef.current)) {
      concurrency = PREFETCH_AFTER_FIRST;
    }
    pump();

    return () => {
      // Keep in-flight results (they still write to cacheRef); just stop pumping.
      alive = false;
    };
  }, [frameIdsKey, loadFrame]);

  // Study upgrade for active frame only — after idle, never blank.
  useEffect(() => {
    if (!activeId) return;
    if (cacheRef.current.get(activeId)?.quality === "study") {
      bumpCache((n) => n + 1);
      return;
    }

    const frame = frames.find((f) => f.id === activeId);
    if (!frame) return;
    const gen = ++studyGenRef.current;

    const whenIdle = () =>
      new Promise<void>((resolve) => {
        const ric = (
          window as Window & {
            requestIdleCallback?: (
              cb: () => void,
              opts?: { timeout: number },
            ) => number;
          }
        ).requestIdleCallback;
        if (typeof ric === "function") ric(() => resolve(), { timeout: 900 });
        else setTimeout(resolve, 120);
      });

    void (async () => {
      if (!cacheRef.current.has(activeId)) {
        const preview = await loadFrameRef.current(frame, "preview");
        if (gen !== studyGenRef.current || !preview?.dataUrl) return;
        if (cacheRef.current.get(activeId)?.quality !== "study") {
          cacheRef.current.set(activeId, preview);
          bumpCache((n) => n + 1);
        }
      }

      await whenIdle();
      if (gen !== studyGenRef.current || activeIdRef.current !== activeId) return;

      const study = await loadFrameRef.current(frame, "study");
      if (gen !== studyGenRef.current || !study?.dataUrl) return;
      if (activeIdRef.current !== activeId) return;
      cacheRef.current.set(activeId, study);
      bumpCache((n) => n + 1);
    })();
  }, [activeId, frameIdsKey]);

  // Display: hold last frame; preload before setUrl so imagery never vanishes.
  useEffect(() => {
    let cancelled = false;

    const showId =
      (activeId && cacheRef.current.has(activeId) ? activeId : null) ??
      (lastShownIdRef.current && cacheRef.current.has(lastShownIdRef.current)
        ? lastShownIdRef.current
        : null);

    const run = async () => {
      if (!showId) return;
      const cached = cacheRef.current.get(showId);
      if (!cached?.dataUrl) return;

      await preloadImage(cached.dataUrl);
      if (cancelled || unmountedRef.current) return;

      let ov = overlaysRef.current.get(showId);
      if (!ov) {
        ov = L.imageOverlay(cached.dataUrl, L.latLngBounds(cached.bounds), {
          opacity: 0,
          interactive: false,
          zIndex: 10,
          className: OVERLAY_CLASS,
        });
        ov.addTo(map);
        overlaysRef.current.set(showId, ov);
        displayUrlRef.current.set(showId, cached.dataUrl);
      } else if (displayUrlRef.current.get(showId) !== cached.dataUrl) {
        // Image already decoded via preload — safe to swap without blanking
        ov.setUrl(cached.dataUrl);
        ov.setBounds(L.latLngBounds(cached.bounds));
        displayUrlRef.current.set(showId, cached.dataUrl);
      }

      overlaysRef.current.forEach((layer, id) => {
        layer.setOpacity(id === showId ? opacity : 0);
      });

      if (activeId && cacheRef.current.has(activeId)) {
        lastShownIdRef.current = activeId;
      } else if (showId) {
        lastShownIdRef.current = showId;
      }
    };

    // Keep current opacity on lastShown while loading
    if (!showId && lastShownIdRef.current) {
      const keep = lastShownIdRef.current;
      overlaysRef.current.forEach((layer, id) => {
        layer.setOpacity(id === keep ? opacity : 0);
      });
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeId, opacity, map, cacheRev]);

  useEffect(() => {
    return () => {
      overlaysRef.current.forEach((ov) => ov.remove());
      overlaysRef.current.clear();
      cacheRef.current.clear();
      displayUrlRef.current.clear();
    };
  }, [map]);

  return null;
}
