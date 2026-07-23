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
import { drawLevel3GatesOnMap, drawOdimGatesOnMap } from "@/lib/drawPolarGates";

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
 * Draws native polar gates in map pixel space so zooming stays sharp
 * (RadarScope/WeatherWise-style), instead of upscaling a fixed PNG overlay.
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
  const layerRef = useRef<L.Layer | null>(null);
  const sweepRef = useRef(sweep);
  const opacityRef = useRef(opacity);
  const redrawTimer = useRef<number | null>(null);

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
      onAdd(this: L.Layer & { _canvas?: HTMLCanvasElement; _onView?: () => void; _onMove?: () => void }) {
        const canvas = L.DomUtil.create("canvas", "radar-polar-canvas") as HTMLCanvasElement;
        canvas.style.pointerEvents = "none";
        this._canvas = canvas;
        canvasRef.current = canvas;
        map.getPane("overlayPane")?.appendChild(canvas);

        const syncSize = () => {
          const size = map.getSize();
          const dpr = Math.min(2.5, window.devicePixelRatio || 1);
          const topLeft = map.containerPointToLayerPoint([0, 0]);
          canvas.width = Math.max(1, Math.round(size.x * dpr));
          canvas.height = Math.max(1, Math.round(size.y * dpr));
          canvas.style.width = `${size.x}px`;
          canvas.style.height = `${size.y}px`;
          L.DomUtil.setPosition(canvas, topLeft);
          return dpr;
        };

        const paint = () => {
          const c = this._canvas;
          if (!c) return;
          const dpr = syncSize();
          const ctx = c.getContext("2d");
          if (!ctx) return;

          const data = sweepRef.current;
          const op = opacityRef.current;
          const palette = lutRef.current;
          const viewport = { width: c.width, height: c.height, dpr };

          if (!data) {
            ctx.clearRect(0, 0, c.width, c.height);
            return;
          }

          if (data.kind === "level3") {
            drawLevel3GatesOnMap(
              ctx,
              map,
              data.parsed.layer,
              data.parsed.latitude,
              data.parsed.longitude,
              palette,
              op,
              viewport,
            );
          } else {
            drawOdimGatesOnMap(ctx, map, data.scan, palette, op, viewport);
          }
        };

        const schedulePaint = () => {
          if (redrawTimer.current != null) {
            cancelAnimationFrame(redrawTimer.current);
          }
          redrawTimer.current = requestAnimationFrame(() => {
            redrawTimer.current = null;
            paint();
          });
        };

        this._onMove = () => {
          syncSize();
        };
        this._onView = schedulePaint;

        map.on("move", this._onMove, this);
        map.on("moveend zoomend resize viewreset", this._onView, this);
        paint();
      },
      onRemove(this: L.Layer & { _canvas?: HTMLCanvasElement; _onView?: () => void; _onMove?: () => void }) {
        if (redrawTimer.current != null) {
          cancelAnimationFrame(redrawTimer.current);
          redrawTimer.current = null;
        }
        if (this._onMove) map.off("move", this._onMove, this);
        if (this._onView) map.off("moveend zoomend resize viewreset", this._onView, this);
        this._canvas?.remove();
        this._canvas = undefined;
        canvasRef.current = null;
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

  // Repaint when sweep / palette / opacity change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = map.getSize();
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(size.x * dpr) || canvas.height !== Math.round(size.y * dpr)) {
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      canvas.width = Math.max(1, Math.round(size.x * dpr));
      canvas.height = Math.max(1, Math.round(size.y * dpr));
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
      L.DomUtil.setPosition(canvas, topLeft);
    }

    const viewport = { width: canvas.width, height: canvas.height, dpr };
    if (!sweep) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (sweep.kind === "level3") {
      drawLevel3GatesOnMap(
        ctx,
        map,
        sweep.parsed.layer,
        sweep.parsed.latitude,
        sweep.parsed.longitude,
        lut,
        opacity,
        viewport,
      );
    } else {
      drawOdimGatesOnMap(ctx, map, sweep.scan, lut, opacity, viewport);
    }
  }, [map, sweep, lut, opacity]);

  return null;
}
