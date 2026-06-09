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

/** Convert IEM ISO scan time to TMS timestamp (YYYYMMDDHHmm). */
export function iemScanIsoToTms(iso: string): string {
  return iso.replace(/[-:TZ]/g, "").slice(0, 12);
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

/** Level III products served by IEM RIDGE (N0C is not available). */
export const IEM_RIDGE_PRODUCTS = new Set([
  "N0B",
  "N0S",
  "N0Z",
  "NET",
]);

export function isIemProductSupported(productId: string): boolean {
  return IEM_RIDGE_PRODUCTS.has(iemProductId(productId));
}

/** True for base reflectivity products (Windy colour scale applies). */
export function isReflectivityProduct(productId: string): boolean {
  if (!productId) return false;
  const id = productId.toUpperCase();
  return id === "N0Q" || id === "N0Z";
}
