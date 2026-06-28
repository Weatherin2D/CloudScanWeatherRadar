/** IEM RIDGE tile cache for single-site NEXRAD imagery (spherical mercator). */
export const IEM_RIDGE_TMS =
  "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0";

/** IEM RIDGE WMS endpoint (legacy; TMS is preferred for Leaflet). */
export const IEM_RIDGE_WMS =
  "https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/ridge.cgi";

/** Default number of recent volume scans to animate in station mode. */
export const STATION_RADAR_FRAME_COUNT = 13;

/** IEM error tile returned for invalid layer names (e.g. 4-char NWS IDs). */
export const IEM_INVALID_TMS_TILE_SIZE = 20229;

/** UI product IDs mapped to IEM archive product IDs (N0Q/N0U were retired). */
const IEM_PRODUCT_MAP: Record<string, string> = {
  N0Q: "N0B",
  N0U: "N0S",
};

export interface StationRadarFrame {
  time: number;
  tmsId: string;
}

/** IEM TMS timestamp for the most recent volume scan (loads without a listing API call). */
export const IEM_LATEST_TMS_ID = "0";

export const IEM_LATEST_FRAME: StationRadarFrame = {
  time: 0,
  tmsId: IEM_LATEST_TMS_ID,
};

/** Keep the newest frame on the fast "latest" tile URL so tiles do not reload after listing. */
export function withLatestFrameAlias(frames: StationRadarFrame[]): StationRadarFrame[] {
  if (!frames.length) return frames;
  const out = [...frames];
  const last = out[out.length - 1]!;
  out[out.length - 1] = { ...last, tmsId: IEM_LATEST_TMS_ID };
  return out;
}

/**
 * Convert NWS site ID to IEM RIDGE sector code.
 * NWS uses 4-char IDs (KMRX, PGUA); IEM TMS expects 3-char sectors (MRX, GUA).
 */
export function iemRidgeSector(stationId: string): string {
  if (!stationId) return "";
  const id = stationId.toUpperCase();
  return id.length === 4 ? id.slice(1) : id;
}

/** Map UI Level-III code to the product ID used by IEM RIDGE/TMS. */
export function iemProductId(uiProduct: string): string {
  if (!uiProduct) return "";
  const id = uiProduct.toUpperCase();
  return IEM_PRODUCT_MAP[id] ?? id;
}

/** Map UI product + tilt index to the IEM RIDGE product code (N0B–N3B). */
export function iemProductForTilt(uiProduct: string, tiltIndex: number): string {
  const baseProd = iemProductId(uiProduct);
  if (baseProd === "N0B" && tiltIndex > 0 && tiltIndex <= 3) {
    return `N${tiltIndex}B`;
  }
  return baseProd;
}

/** Convert IEM ISO scan time to TMS timestamp (YYYYMMDDHHmm). */
export function iemScanIsoToTms(iso: string): string {
  return iso.replace(/[-:TZ]/g, "").slice(0, 12);
}

/** Nationwide mosaic uses N0Q in IEM list/TMS (not the site-level N0B alias). */
export const IEM_USCOMP_RADAR = "USCOMP";
export const IEM_USCOMP_PRODUCT = "N0Q";

export function iemUscompTileUrl(tmsTimestamp = "0"): string {
  return `${IEM_RIDGE_TMS}/ridge::${IEM_USCOMP_RADAR}-${IEM_USCOMP_PRODUCT}-${tmsTimestamp}/{z}/{x}/{y}.png`;
}

/** Build a Leaflet tile URL for a NEXRAD site, product, and optional scan time. */
export function iemRidgeTileUrl(
  stationId: string,
  product: string,
  tmsTimestamp = "0",
): string {
  const sector = iemRidgeSector(stationId);
  const prod = iemProductId(product);
  return `${IEM_RIDGE_TMS}/ridge::${sector}-${prod}-${tmsTimestamp}/{z}/{x}/{y}.png`;
}

/** Warm the browser cache for the station viewport before the tile layer mounts. */
export function prefetchIemStationTiles(
  stationId: string,
  product: string,
  lat: number,
  lon: number,
  zoom = 8,
): void {
  const sector = iemRidgeSector(stationId);
  const prod = iemProductId(product);
  const { x, y } = latLonToTile(lat, lon, zoom);
  const base = `${IEM_RIDGE_TMS}/ridge::${sector}-${prod}-${IEM_LATEST_TMS_ID}`;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = `${base}/${zoom}/${x + dx}/${y + dy}.png`;
    }
  }
}

/** Map lat/lon to slippy-map tile indices at a given zoom. */
export function latLonToTile(lat: number, lon: number, zoom: number) {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y };
}

/** Level III products served by IEM RIDGE. */
export const IEM_RIDGE_PRODUCTS = new Set([
  "N0B", // Base reflectivity tilt 1 (0.5°)
  "N1B", // Base reflectivity tilt 2 (1.5°)
  "N2B", // Base reflectivity tilt 3 (2.4°)
  "N3B", // Base reflectivity tilt 4 (3.4°)
  "N0S", // Storm relative velocity
  "N0Z", // Base reflectivity (legacy)
  "NET", // Echo tops
]);

export function isIemProductSupported(productId: string): boolean {
  return IEM_RIDGE_PRODUCTS.has(iemProductId(productId));
}

/** True for base reflectivity products (Windy colour scale applies). */
export function isReflectivityProduct(productId: string): boolean {
  if (!productId) return false;
  const id = productId.toUpperCase();
  if (id === "N0Z" || id === "N0Q") return true;
  return /^N\dB$/.test(id);
}
