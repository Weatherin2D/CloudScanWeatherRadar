import { getRadarProduct, type RadarDataSource, type RadarProduct } from "@/lib/radarProducts";
import { GLOBAL_IEM_PRODUCT, GLOBAL_IEM_RADAR } from "@/lib/globalRadar";
import { parseLevel3 } from "@/lib/level3Parse";
import { level3ObjectUrl } from "@/lib/level3Radar";
import { loadOdimScan } from "@/lib/operaRadar";
import { sampleLevel3Radial, sampleOdimRadial } from "@/lib/polarSample";
import { pickProbeZoom, sampleIemProduct, sampleRainViewerDbz } from "@/lib/tileSample";

export interface PixelProbeContext {
  mode: "overview" | "station" | "alerts" | "models";
  mapZoom: number;
  product?: RadarProduct;
  dataSource?: RadarDataSource | null;
  stationId?: string;
  stationLat?: number;
  stationLon?: number;
  rainViewerFramePath?: string;
  frameTime?: number;
  iemTmsId?: string;
  level3FrameKey?: string;
  operaOdimUrl?: string;
}

export interface PixelProbeResult {
  lat: number;
  lon: number;
  productLabel: string;
  value: number | null;
  unit: string;
  frameTime?: number;
}

const level3Cache = new Map<string, Awaited<ReturnType<typeof parseLevel3>>>();

function unitForProduct(product: RadarProduct | undefined): string {
  if (!product) return "";
  switch (product.family) {
    case "reflectivity":
    case "longrange":
      return "dBZ";
    case "velocity":
      return "kt";
    case "correlation":
      return "";
    case "zdr":
      return "dB";
    case "kdp":
      return "°/km";
    case "echotops":
      return "kft";
    default:
      return "";
  }
}

async function probeLevel3(
  ctx: PixelProbeContext,
  lat: number,
  lon: number,
): Promise<number | null> {
  const key = ctx.level3FrameKey;
  if (!key) return null;

  let parsed = level3Cache.get(key);
  if (!parsed) {
    const res = await fetch(level3ObjectUrl(key));
    if (!res.ok) return null;
    parsed = await parseLevel3(await res.arrayBuffer());
    if (!parsed) return null;
    if (level3Cache.size > 16) {
      const first = level3Cache.keys().next().value;
      if (first) level3Cache.delete(first);
    }
    level3Cache.set(key, parsed);
  }

  return sampleLevel3Radial(
    parsed.layer,
    parsed.latitude,
    parsed.longitude,
    lat,
    lon,
  );
}

async function probeOpera(
  ctx: PixelProbeContext,
  lat: number,
  lon: number,
): Promise<number | null> {
  if (!ctx.operaOdimUrl || ctx.stationLat == null || ctx.stationLon == null) return null;
  const scan = await loadOdimScan(ctx.operaOdimUrl, ctx.stationLat, ctx.stationLon);
  if (!scan) return null;
  return sampleOdimRadial(scan, lat, lon);
}

export async function probeRadarPixel(
  ctx: PixelProbeContext,
  lat: number,
  lon: number,
): Promise<PixelProbeResult> {
  const product = ctx.product;
  const productLabel = product?.label ?? "Radar";
  const unit = unitForProduct(product);
  const zoom = pickProbeZoom(ctx.mapZoom);
  let value: number | null = null;

  if (ctx.mode === "overview" || ctx.mode === "alerts") {
    if (ctx.rainViewerFramePath) {
      value = await sampleRainViewerDbz(lat, lon, ctx.rainViewerFramePath, zoom);
    } else if (ctx.iemTmsId) {
      value = await sampleIemProduct(
        lat,
        lon,
        GLOBAL_IEM_RADAR,
        GLOBAL_IEM_PRODUCT,
        ctx.iemTmsId,
        zoom,
      );
    }
  } else if (ctx.mode === "station" && product && ctx.stationId) {
    if (ctx.dataSource === "iem" && ctx.iemTmsId) {
      value = await sampleIemProduct(
        lat,
        lon,
        ctx.stationId,
        product.id,
        ctx.iemTmsId,
        zoom,
      );
    } else if (ctx.dataSource === "level3") {
      value = await probeLevel3(ctx, lat, lon);
    } else if (ctx.dataSource === "opera") {
      value = await probeOpera(ctx, lat, lon);
    }
  }

  return {
    lat,
    lon,
    productLabel,
    value,
    unit,
    frameTime: ctx.frameTime,
  };
}

export function formatProbeValue(result: PixelProbeResult): string {
  if (result.value == null) return "No data";
  const rounded =
    Math.abs(result.value) >= 10
      ? result.value.toFixed(1)
      : result.value.toFixed(2);
  return result.unit ? `${rounded} ${result.unit}` : rounded;
}

export function clearLevel3ProbeCache(): void {
  level3Cache.clear();
}
