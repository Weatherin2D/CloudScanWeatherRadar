import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { ModelGridData } from "@/lib/modelGrid";
import {
  ModelFieldSampler,
  particleCountForSize,
  spawnParticle,
  type WindParticle,
} from "@/lib/modelFieldSampler";
import {
  modelVariable,
  valueToColor,
  type ModelVariableId,
  type PaletteId,
} from "@/lib/ecmwfModels";

interface Props {
  grid: ModelGridData | null;
  variableId: ModelVariableId;
  hourIndex: number;
  opacity: number;
}

/** Pixel stride — 1 = full resolution, 2 = half (faster). */
function renderStride(zoom: number): number {
  if (zoom >= 8) return 1;
  if (zoom >= 6) return 2;
  return 2;
}

function renderScalarField(
  ctx: CanvasRenderingContext2D,
  map: L.Map,
  sampler: ModelFieldSampler,
  palette: PaletteId,
  opacity: number,
  variableId: ModelVariableId,
  scalarParam: string,
  topLeft: L.Point,
  width: number,
  height: number,
  zoom: number,
) {
  const stride = renderStride(zoom);
  const image = ctx.createImageData(width, height);
  const px = image.data;
  const capeField = variableId === "precipitation";

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const layerPt = L.point(topLeft.x + x, topLeft.y + y);
      const latlng = map.layerPointToLatLng(layerPt);

      let value = sampler.sampleScalar(latlng.lat, latlng.lng);
      if (value == null) continue;

      let alpha = opacity;
      if (variableId === "precipitation" || variableId === "rain") {
        alpha *= value > 0.01 ? 0.85 : 0.15;
      }

      const [r, g, b, a] = valueToColor(palette, value, Math.round(alpha * 220));
      if (a === 0) continue;

      if (capeField) {
        const cape = sampler.sampleExtra("cape", latlng.lat, latlng.lng);
        if (cape != null && cape >= 400) {
          const t = Math.min(1, cape / 2500);
          const cr = Math.round(r + (255 - r) * t * 0.6);
          const cg = Math.round(g + (220 - g) * t * 0.5);
          fillBlock(px, width, height, x, y, stride, cr, cg, b, a);
          continue;
        }
      }

      fillBlock(px, width, height, x, y, stride, r, g, b, a);
    }
  }

  ctx.putImageData(image, 0, 0);
}

function fillBlock(
  px: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  stride: number,
  r: number,
  g: number,
  b: number,
  a: number,
) {
  for (let dy = 0; dy < stride && y + dy < height; dy++) {
    for (let dx = 0; dx < stride && x + dx < width; dx++) {
      const i = ((y + dy) * width + (x + dx)) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = a;
    }
  }
}

export default function ModelFieldLayer({ grid, variableId, hourIndex, opacity }: Props) {
  const map = useMap();
  const fieldCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const windCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const layerRef = useRef<L.Layer | null>(null);
  const gridRef = useRef(grid);
  const variableRef = useRef(variableId);
  const hourRef = useRef(hourIndex);
  const opacityRef = useRef(opacity);
  const animRef = useRef<number | null>(null);
  const particlesRef = useRef<WindParticle[]>([]);
  const samplerRef = useRef<ModelFieldSampler | null>(null);

  gridRef.current = grid;
  variableRef.current = variableId;
  hourRef.current = hourIndex;
  opacityRef.current = opacity;

  useEffect(() => {
    const DualCanvasOverlay = L.Layer.extend({
      onAdd(this: L.Layer & {
        _fieldCanvas?: HTMLCanvasElement;
        _windCanvas?: HTMLCanvasElement;
        _sync?: () => void;
        _redrawField?: () => void;
      }) {
        const fieldCanvas = L.DomUtil.create("canvas", "leaflet-model-field") as HTMLCanvasElement;
        const windCanvas = L.DomUtil.create("canvas", "leaflet-model-wind") as HTMLCanvasElement;
        fieldCanvas.style.pointerEvents = "none";
        windCanvas.style.pointerEvents = "none";
        windCanvas.style.mixBlendMode = "screen";

        this._fieldCanvas = fieldCanvas;
        this._windCanvas = windCanvas;
        fieldCanvasRef.current = fieldCanvas;
        windCanvasRef.current = windCanvas;

        const pane = map.getPane("overlayPane");
        pane?.appendChild(fieldCanvas);
        pane?.appendChild(windCanvas);

        this._sync = () => {
          const size = map.getSize();
          const topLeft = map.containerPointToLayerPoint([0, 0]);
          for (const c of [fieldCanvas, windCanvas]) {
            c.width = size.x;
            c.height = size.y;
            c.style.width = `${size.x}px`;
            c.style.height = `${size.y}px`;
            L.DomUtil.setPosition(c, topLeft);
          }
        };

        this._redrawField = () => {
          this._sync?.();
          redrawFieldLayer(fieldCanvas, map);
        };

        map.on("move", this._sync, this);
        map.on("moveend zoomend resize viewreset", this._redrawField, this);
        this._redrawField();
        startWindAnimation();
      },
      onRemove(this: L.Layer & {
        _fieldCanvas?: HTMLCanvasElement;
        _windCanvas?: HTMLCanvasElement;
        _sync?: () => void;
        _redrawField?: () => void;
      }) {
        stopWindAnimation();
        if (this._sync) map.off("move", this._sync, this);
        if (this._redrawField) {
          map.off("moveend zoomend resize viewreset", this._redrawField, this);
        }
        this._fieldCanvas?.remove();
        this._windCanvas?.remove();
        fieldCanvasRef.current = null;
        windCanvasRef.current = null;
      },
    });

    function buildSampler(): ModelFieldSampler | null {
      const data = gridRef.current;
      if (!data?.cells.length) return null;
      const variable = modelVariable(variableRef.current);
      const hour = Math.max(0, Math.min(hourRef.current, data.times.length - 1));

      const sampler = new ModelFieldSampler(
        data,
        hour,
        data.scalarParam,
        variable.kind === "wind",
      );

      if (variable.id === "precipitation") {
        sampler.addExtraField(data, hour, "cape");
      }
      return sampler;
    }

    function redrawFieldLayer(canvas: HTMLCanvasElement, m: L.Map) {
      const data = gridRef.current;
      const variable = modelVariable(variableRef.current);
      const op = opacityRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      const size = m.getSize();
      ctx.clearRect(0, 0, size.x, size.y);

      const sampler = buildSampler();
      samplerRef.current = sampler;
      if (!sampler || !data) return;

      const topLeft = m.containerPointToLayerPoint([0, 0]);
      const palette = variable.palette as PaletteId;

      renderScalarField(
        ctx,
        m,
        sampler,
        palette,
        op,
        variable.id,
        data.scalarParam,
        topLeft,
        size.x,
        size.y,
        m.getZoom(),
      );

      resetParticles(size.x, size.y);
    }

    function resetParticles(w: number, h: number) {
      const count = particleCountForSize(w, h);
      particlesRef.current = Array.from({ length: count }, () => spawnParticle(w, h));
    }

    function stopWindAnimation() {
      if (animRef.current != null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    }

    function startWindAnimation() {
      stopWindAnimation();

      const tick = () => {
        const canvas = windCanvasRef.current;
        const variable = modelVariable(variableRef.current);
        if (!canvas) {
          animRef.current = requestAnimationFrame(tick);
          return;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          animRef.current = requestAnimationFrame(tick);
          return;
        }

        const w = canvas.width;
        const h = canvas.height;

        if (variable.kind !== "wind") {
          ctx.clearRect(0, 0, w, h);
          animRef.current = requestAnimationFrame(tick);
          return;
        }

        const sampler = samplerRef.current;
        if (!sampler) {
          animRef.current = requestAnimationFrame(tick);
          return;
        }

        ctx.globalCompositeOperation = "destination-in";
        ctx.fillStyle = "rgba(0,0,0,0.92)";
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "source-over";

        const topLeft = map.containerPointToLayerPoint([0, 0]);
        const zoom = map.getZoom();
        const speedScale = 0.35 * (zoom / 5);

        ctx.lineWidth = 1.1;
        ctx.lineCap = "round";

        let particles = particlesRef.current;
        if (particles.length === 0) resetParticles(w, h);
        particles = particlesRef.current;

        for (const p of particles) {
          const layerX = topLeft.x + p.x;
          const layerY = topLeft.y + p.y;
          const latlng = map.layerPointToLatLng(L.point(layerX, layerY));
          const uv = sampler.sampleUV(latlng.lat, latlng.lng);

          const prevX = p.x;
          const prevY = p.y;

          if (uv) {
            const [uu, vv] = uv;
            p.x += uu * speedScale;
            p.y -= vv * speedScale;
          }

          p.age += 1;
          const life = 1 - p.age / p.maxAge;
          if (life > 0 && uv) {
            ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.75, life * 0.85)})`;
            ctx.beginPath();
            ctx.moveTo(prevX, prevY);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }

          if (
            p.age >= p.maxAge
            || p.x < 0
            || p.y < 0
            || p.x >= w
            || p.y >= h
            || !uv
          ) {
            Object.assign(p, spawnParticle(w, h));
          }
        }

        animRef.current = requestAnimationFrame(tick);
      };

      animRef.current = requestAnimationFrame(tick);
    }

    const layer = new DualCanvasOverlay();
    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      stopWindAnimation();
      layer.remove();
      layerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const layer = layerRef.current as L.Layer & { _redrawField?: () => void };
    samplerRef.current = null;
    layer?._redrawField?.();
  }, [grid, variableId, hourIndex, opacity]);

  return null;
}
