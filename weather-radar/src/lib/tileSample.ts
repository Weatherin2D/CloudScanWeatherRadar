import { latLonToTile } from "@/lib/iemRadar";
import { rainViewerByteToDbz } from "@/lib/palPalette";
import { iemIndexToDbz, iemRgbToIndex } from "@/lib/iemColormap";

const tileCanvasCache = new Map<string, HTMLCanvasElement>();

async function loadTile(url: string): Promise<HTMLCanvasElement | null> {
  const cached = tileCanvasCache.get(url);
  if (cached) return cached;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      if (tileCanvasCache.size > 48) {
        const first = tileCanvasCache.keys().next().value;
        if (first) tileCanvasCache.delete(first);
      }
      tileCanvasCache.set(url, canvas);
      resolve(canvas);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function pixelInTile(lat: number, lon: number, zoom: number, x: number, y: number) {
  const n = 2 ** zoom;
  const globalX = ((lon + 180) / 360) * n * 256;
  const latRad = (lat * Math.PI) / 180;
  const globalY =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * 256;
  return {
    px: Math.floor(globalX - x * 256),
    py: Math.floor(globalY - y * 256),
  };
}

async function samplePixel(
  lat: number,
  lon: number,
  zoom: number,
  tileUrl: (z: number, x: number, y: number) => string,
  decode: (r: number, g: number, b: number, a: number) => number | null,
): Promise<number | null> {
  const { x, y } = latLonToTile(lat, lon, zoom);
  const canvas = await loadTile(tileUrl(zoom, x, y));
  if (!canvas) return null;

  const { px, py } = pixelInTile(lat, lon, zoom, x, y);
  if (px < 0 || py < 0 || px >= 256 || py >= 256) return null;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const d = ctx.getImageData(px, py, 1, 1).data;
  return decode(d[0], d[1], d[2], d[3]);
}

export function pickSampleZoom(lineLengthKm: number): number {
  if (lineLengthKm > 800) return 5;
  if (lineLengthKm > 300) return 6;
  if (lineLengthKm > 100) return 7;
  return 8;
}

export async function sampleRainViewerDbz(
  lat: number,
  lon: number,
  framePath: string,
  zoom: number,
): Promise<number | null> {
  return samplePixel(
    lat,
    lon,
    zoom,
    (z, x, y) => `https://tilecache.rainviewer.com${framePath}/256/${z}/${x}/${y}/255/0_0.png`,
    (r, _g, _b, a) => {
      if (a < 10) return null;
      const dbz = rainViewerByteToDbz(r);
      return dbz <= -32 ? null : dbz;
    },
  );
}

export async function sampleIemDbz(
  lat: number,
  lon: number,
  stationId: string,
  product: string,
  tmsId: string,
  zoom: number,
): Promise<number | null> {
  const sector = stationId.length === 4 ? stationId.slice(1) : stationId;
  const prod = product.toUpperCase().replace("N0Q", "N0B").replace("N0U", "N0S");
  return samplePixel(
    lat,
    lon,
    zoom,
    (z, x, y) =>
      `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::${sector}-${prod}-${tmsId}/${z}/${x}/${y}.png`,
    (r, g, b, a) => {
      if (a < 10) return null;
      const idx = iemRgbToIndex(r, g, b);
      if (idx <= 0) return null;
      return iemIndexToDbz(idx);
    },
  );
}

export function clearTileSampleCache(): void {
  tileCanvasCache.clear();
}
