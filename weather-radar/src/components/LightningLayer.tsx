import { useCallback, useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { LightningStrike } from "@/hooks/useLightning";

interface Props {
  strikes: LightningStrike[];
  size: number;
  maxAge: number;
}

/** Simple white bolt path (viewBox 0 0 12 22). */
const BOLT_W = 12;
const BOLT_H = 22;
const BOLT_POINTS: [number, number][] = [
  [9, 0], [2, 12], [7, 12], [3, 22], [11, 10], [6, 10],
];

function drawBolt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opacity: number,
) {
  const sx = w / BOLT_W;
  const sy = h / BOLT_H;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  const [fx, fy] = BOLT_POINTS[0];
  ctx.moveTo(x + (fx - BOLT_W / 2) * sx, y + (fy - BOLT_H / 2) * sy);
  for (let i = 1; i < BOLT_POINTS.length; i++) {
    const [px, py] = BOLT_POINTS[i];
    ctx.lineTo(x + (px - BOLT_W / 2) * sx, y + (py - BOLT_H / 2) * sy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export default function LightningLayer({ strikes, size, maxAge }: Props) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strikesRef = useRef(strikes);
  const sizeRef = useRef(size);
  const maxAgeRef = useRef(maxAge);
  const rafRef = useRef<number | null>(null);

  strikesRef.current = strikes;
  sizeRef.current = size;
  maxAgeRef.current = maxAge;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mapSize = map.getSize();
    const topLeft = map.containerPointToLayerPoint(L.point(0, 0));
    L.DomUtil.setPosition(canvas, topLeft);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(mapSize.x * dpr);
    canvas.height = Math.floor(mapSize.y * dpr);
    canvas.style.width = `${mapSize.x}px`;
    canvas.style.height = `${mapSize.y}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, mapSize.x, mapSize.y);

    const now = Date.now();
    const maxAgeMs = maxAgeRef.current * 60 * 1000;
    const baseW = Math.max(6, Math.round(sizeRef.current * 10));
    const pad = Math.max(baseW, 20);

    for (const strike of strikesRef.current) {
      const age = now - strike.time;
      if (age < 0 || age >= maxAgeMs) continue;

      const layerPt = map.latLngToLayerPoint([strike.lat, strike.lon]);
      const x = layerPt.x - topLeft.x;
      const y = layerPt.y - topLeft.y;
      if (x < -pad || y < -pad || x > mapSize.x + pad || y > mapSize.y + pad) continue;

      const freshness = 1 - age / maxAgeMs;
      const opacity = Math.max(0.2, freshness * 0.75 + 0.25);
      const w = freshness > 0.95 ? baseW * 1.15 : baseW;
      const h = w * (BOLT_H / BOLT_W);
      drawBolt(ctx, x, y, w, h, opacity);
    }
  }, [map]);

  const scheduleRedraw = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      redraw();
    });
  }, [redraw]);

  useEffect(() => {
    const pane = map.getPane("overlayPane");
    if (!pane) return;

    const canvas = L.DomUtil.create("canvas", "lightning-canvas") as HTMLCanvasElement;
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "650";
    pane.appendChild(canvas);
    canvasRef.current = canvas;

    map.on("move zoom resize viewreset", scheduleRedraw);
    scheduleRedraw();

    return () => {
      map.off("move zoom resize viewreset", scheduleRedraw);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      canvas.remove();
      canvasRef.current = null;
    };
  }, [map, scheduleRedraw]);

  useEffect(() => {
    scheduleRedraw();
  }, [strikes, size, maxAge, scheduleRedraw]);

  useEffect(() => {
    const id = setInterval(scheduleRedraw, 5000);
    return () => clearInterval(id);
  }, [scheduleRedraw]);

  return null;
}
