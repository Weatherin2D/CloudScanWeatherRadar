import { OPERA_STATION_MAP } from "./operaStationMap";
import type { OdimScanMeta } from "./renderPolar";

export const METEOGATE_BASE =
  import.meta.env.DEV ? "/api/meteogate" : "https://api.meteogate.eu";

export const OPENRADAR_S3_BASE =
  import.meta.env.DEV ? "/api/openradar" : "https://s3.waw3-1.cloudferro.com";

export interface OperaFrame {
  time: number;
  /** Direct ODIM HDF5 URL on openradar-24h bucket. */
  odimUrl: string;
}

export function operaMetaForStation(stationId: string) {
  return OPERA_STATION_MAP[stationId] ?? null;
}

function toIsoRange(hours = 6): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600_000);
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  return { start: iso(start), end: iso(end) };
}

/** Fetch recent ODIM scans for an EU station + product from MeteoGate. */
export async function fetchOperaFrames(
  stationId: string,
  standardName: "DBZH" | "VRADH",
  maxFrames = 13,
): Promise<OperaFrame[]> {
  const meta = operaMetaForStation(stationId);
  if (!meta) return [];

  const { start, end } = toIsoRange(6);
  const dt = encodeURIComponent(`${start}/${end}`);
  const url =
    `${METEOGATE_BASE}/eu-eumetnet-weather-radar/collections/observations/locations/` +
    `${encodeURIComponent(meta.locationId)}?datetime=${dt}&standard_name=${standardName}` +
    `&level=../5.0&format=ODIM&f=CoverageJSON`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const json = await res.json();
  const odimLinks: string[] = [];
  for (const cov of json.coverages ?? []) {
    const level = cov.domain?.axes?.z?.values?.[0] as number | undefined;
    if (level != null && level > 2.5) continue;
    for (const l of cov.links ?? []) {
      if (l.href?.includes("openradar-24h") && l.href.includes(".h5")) {
        odimLinks.push(
          l.href.replace("https://s3.waw3-1.cloudferro.com", OPENRADAR_S3_BASE),
        );
      }
    }
  }

  const byTime = new Map<number, string>();
  for (const href of odimLinks) {
    const m = href.match(/@(\d{8}T\d{4})@/);
    if (!m) continue;
    const ts = m[1];
    const time = Math.floor(
      Date.UTC(
        +ts.slice(0, 4),
        +ts.slice(4, 6) - 1,
        +ts.slice(6, 8),
        +ts.slice(9, 11),
        +ts.slice(11, 13),
      ) / 1000,
    );
    byTime.set(time, href);
  }

  return Array.from(byTime.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(-maxFrames)
    .map(([time, odimUrl]) => ({ time, odimUrl }));
}

type H5Entity = {
  attrs?: Record<string, { value?: unknown } | unknown>;
  value?: Float32Array | Int16Array | Uint8Array | Uint16Array;
};

function h5Attr(entity: H5Entity | null | undefined, name: string, fallback: number): number {
  const raw = entity?.attrs?.[name];
  if (raw == null) return fallback;
  const v = typeof raw === "object" && raw !== null && "value" in raw ? raw.value : raw;
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Parse ODIM HDF5 SCAN into renderable polar data. */
export async function loadOdimScan(
  url: string,
  lat: number,
  lon: number,
): Promise<OdimScanMeta | null> {
  try {
    const h5 = await import("h5wasm");
    await h5.ready;
    const FS = h5.FS;
    if (!FS) return null;

    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());

    const fname = "scan.h5";
    FS.writeFile(fname, buf);
    const f = new h5.File(fname, "r");

    try {
      const where = f.get("where") as H5Entity | null;
      const ds = f.get("dataset1/data1/data") as H5Entity | null;
      const dsWhat = f.get("dataset1/data1/what") as H5Entity | null;
      const dsWhere = f.get("dataset1/where") as H5Entity | null;

      if (!ds?.value || !dsWhere) return null;

      const nodata = h5Attr(dsWhat, "nodata", 65535);
      const undetect = h5Attr(dsWhat, "undetect", 0);
      const gain = h5Attr(dsWhat, "gain", 1);
      const offset = h5Attr(dsWhat, "offset", 0);
      const nbins = h5Attr(dsWhere, "nbins", 0);
      const nrays = h5Attr(dsWhere, "nrays", 0);
      const rstart = h5Attr(dsWhere, "rstart", 0);
      const rscale = h5Attr(dsWhere, "rscale", 250);
      const a1gate = h5Attr(dsWhere, "a1gate", 0);
      const elangle = h5Attr(dsWhere, "elangle", 0);

      const radarLat = h5Attr(where, "lat", lat);
      const radarLon = h5Attr(where, "lon", lon);

      const raw = ds.value;
      const values =
        raw instanceof Float32Array
          ? raw
          : raw instanceof Uint16Array || raw instanceof Int16Array || raw instanceof Uint8Array
            ? raw
            : new Float32Array(raw as ArrayLike<number>);

      return {
        lat: radarLat,
        lon: radarLon,
        elangle,
        nbins,
        nrays,
        rstart,
        rscale,
        a1gate,
        values,
        nodata,
        undetect,
        gain,
        offset,
      };
    } finally {
      f.close();
      try {
        FS.unlink(fname);
      } catch {
        /* ignore */
      }
    }
  } catch {
    return null;
  }
}
