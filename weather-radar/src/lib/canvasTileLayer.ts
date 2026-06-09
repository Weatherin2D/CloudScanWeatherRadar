import L from "leaflet";
import { iemRgbToIndex } from "./iemColormap";

export type CanvasColorMode = "channel" | "luminance" | "iem";

export type CanvasTileLayer = L.TileLayer & {
  options: L.TileLayerOptions & { lut?: Uint8ClampedArray; colorMode?: CanvasColorMode };
};

function sampleIntensity(
  data: Uint8ClampedArray,
  i: number,
  mode: CanvasColorMode,
): number {
  if (mode === "luminance") {
    return Math.round(
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
    );
  }
  return data[i];
}

export const CanvasTileLayerClass = L.TileLayer.extend({
  createTile(coords: L.Coords, done: L.DoneCallback) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        done(undefined, canvas);
        return;
      }

      ctx.drawImage(img, 0, 0);

      const opts = (this as CanvasTileLayer).options;
      const lut = opts.lut;
      if (lut) {
        try {
          const imageData = ctx.getImageData(0, 0, 256, 256);
          const d = imageData.data;
          const mode = opts.colorMode ?? "channel";
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] === 0) continue;
            const idx =
              mode === "iem"
                ? iemRgbToIndex(d[i], d[i + 1], d[i + 2])
                : mode === "luminance"
                  ? sampleIntensity(d, i, "luminance")
                  : d[i];
            const o = idx * 4;
            if (lut[o + 3] === 0) {
              d[i + 3] = 0;
              continue;
            }
            d[i]     = lut[o];
            d[i + 1] = lut[o + 1];
            d[i + 2] = lut[o + 2];
            d[i + 3] = lut[o + 3];
          }
          ctx.putImageData(imageData, 0, 0);
        } catch {
          // CORS taint — leave source pixels as-is
        }
      }

      done(undefined, canvas);
    };

    img.onerror = () => done(undefined, canvas);

    img.src = (this as L.TileLayer).getTileUrl(coords);
    return canvas;
  },
}) as unknown as new (
  url: string,
  options?: L.TileLayerOptions & { lut?: Uint8ClampedArray; colorMode?: CanvasColorMode },
) => CanvasTileLayer;
