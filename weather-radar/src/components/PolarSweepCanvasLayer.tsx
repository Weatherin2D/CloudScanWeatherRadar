import { useEffect, useMemo, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { ColorStop, ReflectivityFadeSettings } from "@/lib/palPalette";
import {
  DEFAULT_REFLECTIVITY_FADE,
  stopsToDbzUint32LUT,
} from "@/lib/palPalette";
import type { Level3Parsed } from "@/lib/level3Parse";
import type { OdimScanMeta } from "@/lib/renderPolar";
import { paintLevel3Gates, paintOdimGates } from "@/lib/drawPolarGates";

export type PolarSweepData =
  | { kind: "level3"; parsed: Level3Parsed }
  | { kind: "opera"; scan: OdimScanMeta };

interface Props {
  sweep: PolarSweepData | null;
  opacity: number;
  stops: ColorStop[];
  reflectivity?: boolean;
  reflectivityFade?: ReflectivityFadeSettings;
}

/**
 * Map-space polar gate canvas that stays visible while panning/zooming:
 * - never clears on pan (only repositions)
 * - paints into an offscreen buffer, then blits (no blank flash)
 * - debounces zoom/resize redraws
 */
export default function PolarSweepCanvasLayer({
  sweep,
  opacity,
  stops,
  reflectivity = false,
  reflectivityFade = DEFAULT_REFLECTIVITY_FADE,
}: Props) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const layerRef = useRef<L.Layer | null>(null);
  const sweepRef = useRef(sweep);
  const opacityRef = useRef(opacity);
  const paintGenRef = useRef(0);
  const debounceRef = useRef<number | null>(null);
  const paintFnRef = useRef<(() => void) | null>(null);

  const lut = useMemo(
    () => stopsToDbzUint32LUT(stops, reflectivity, reflectivityFade),
    [stops, reflectivity, reflectivityFade],
  );
  const lutRef = useRef(lut);
  lutRef.current = lut;
  sweepRef.current = sweep;
  opacityRef.current = opacity;

  useEffect(() => {
    const CanvasOverlay = L.Layer.extend({
      onAdd(this: L.Layer & {
        _canvas?: HTMLCanvasElement;
        _onMove?: () => void;
        _onView?: () => void;
        _onZoomStart?: () => void;
      }) {
        const canvas = L.DomUtil.create("canvas", "radar-polar-canvas") as HTMLCanvasElement;
        canvas.style.pointerEvents = "none";
        this._canvas = canvas;
        canvasRef.current = canvas;
        map.getPane("overlayPane")?.appendChild(canvas);

        if (!bufferRef.current) {
          bufferRef.current = document.createElement("canvas");
        }

        const dprNow = () => Math.min(2, window.devicePixelRatio || 1);

        /** Reposition only — never assign width/height (that clears pixels). */
        const reposition = () => {
          const topLeft = map.containerPointToLayerPoint([0, 0]);
          L.DomUtil.setPosition(canvas, topLeft);
        };

        const ensureSize = (c: HTMLCanvasElement): { w: number; h: number; dpr: number; resized: boolean } => {
          const size = map.getSize();
          const dpr = dprNow();
          const w = Math.max(1, Math.round(size.x * dpr));
          const h = Math.max(1, Math.round(size.y * dpr));
          const resized = c.width !== w || c.height !== h;
          if (resized) {
            c.width = w;
            c.height = h;
            c.style.width = `${size.x}px`;
            c.style.height = `${size.y}px`;
          }
          return { w, h, dpr, resized };
        };

        const paint = () => {
          const visible = this._canvas;
          const buffer = bufferRef.current;
          if (!visible || !buffer) return;

          const gen = ++paintGenRef.current;
          reposition();
          const { w, h, dpr } = ensureSize(buffer);
          // Keep visible canvas same CSS size; only replace pixels after buffer is ready
          if (visible.style.width !== `${map.getSize().x}px`) {
            visible.style.width = `${map.getSize().x}px`;
            visible.style.height = `${map.getSize().y}px`;
          }

          const data = sweepRef.current;
          const bufCtx = buffer.getContext("2d");
          if (!bufCtx) return;

          if (!data) {
            // Hold last pixels — do not clear visible canvas
            return;
          }

          const imageData = bufCtx.createImageData(w, h);
          if (data.kind === "level3") {
            paintLevel3Gates(
              imageData,
              map,
              data.parsed.layer,
              data.parsed.latitude,
              data.parsed.longitude,
              lutRef.current,
              opacityRef.current,
              dpr,
            );
          } else {
            paintOdimGates(
              imageData,
              map,
              data.scan,
              lutRef.current,
              opacityRef.current,
              dpr,
            );
          }

          if (gen !== paintGenRef.current) return;

          bufCtx.putImageData(imageData, 0, 0);

          // Resize visible only when needed, then blit buffer → visible (atomic swap)
          const vis = ensureSize(visible);
          const vctx = visible.getContext("2d");
          if (!vctx) return;
          if (vis.resized) {
            // resized cleared visible — blit immediately
          }
          vctx.setTransform(1, 0, 0, 1, 0, 0);
          vctx.clearRect(0, 0, visible.width, visible.height);
          vctx.drawImage(buffer, 0, 0);
          reposition();
        };

        paintFnRef.current = paint;

        const schedulePaint = (delayMs = 0) => {
          if (debounceRef.current != null) {
            window.clearTimeout(debounceRef.current);
            debounceRef.current = null;
          }
          if (delayMs <= 0) {
            requestAnimationFrame(() => paint());
            return;
          }
          debounceRef.current = window.setTimeout(() => {
            debounceRef.current = null;
            requestAnimationFrame(() => paint());
          }, delayMs);
        };

        this._onMove = () => {
          // Pan: only move the canvas with the map — keep pixels
          reposition();
        };
        this._onZoomStart = () => {
          // Keep last frame visible during zoom animation
          reposition();
        };
        this._onView = () => {
          // Zoom/resize need a fresh projection — slight debounce to coalesce events
          schedulePaint(32);
        };

        map.on("move", this._onMove, this);
        map.on("zoomstart", this._onZoomStart, this);
        map.on("moveend zoomend resize viewreset", this._onView, this);
        paint();
      },
      onRemove(this: L.Layer & {
        _canvas?: HTMLCanvasElement;
        _onMove?: () => void;
        _onView?: () => void;
        _onZoomStart?: () => void;
      }) {
        if (debounceRef.current != null) {
          window.clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        paintGenRef.current++;
        if (this._onMove) map.off("move", this._onMove, this);
        if (this._onZoomStart) map.off("zoomstart", this._onZoomStart, this);
        if (this._onView) map.off("moveend zoomend resize viewreset", this._onView, this);
        this._canvas?.remove();
        this._canvas = undefined;
        canvasRef.current = null;
        paintFnRef.current = null;
      },
    });

    const layer = new CanvasOverlay();
    layerRef.current = layer;
    map.addLayer(layer);

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map]);

  // Repaint when sweep / palette / opacity change — never blank first
  useEffect(() => {
    paintFnRef.current?.();
  }, [sweep, lut, opacity]);

  return null;
}
