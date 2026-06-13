import { proxiedApiBase } from "./apiProxy";
import { iemRidgeSector } from "./iemRadar";
import { level3ListingHours } from "@/lib/radarFrameLimits";

export const LEVEL3_S3_BASE = proxiedApiBase(
  "/api/nexrad-l3",
  "https://unidata-nexrad-level3.s3.amazonaws.com",
);

export interface Level3Frame {
  time: number;
  key: string;
}

export function level3Sector(stationId: string): string {
  return iemRidgeSector(stationId);
}

export function level3ObjectUrl(key: string): string {
  return `${LEVEL3_S3_BASE}/${key}`;
}

/** Parse S3 key timestamp → unix seconds. */
export function level3KeyToTime(key: string): number {
  const m = key.match(/_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})$/);
  if (!m) return 0;
  return Math.floor(
    Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000,
  );
}

function recentLevel3StartAfter(prefix: string, hoursBack: number): string {
  const d = new Date(Date.now() - hoursBack * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix}${d.getUTCFullYear()}_${pad(d.getUTCMonth() + 1)}_${pad(d.getUTCDate())}_${pad(d.getUTCHours())}_${pad(d.getUTCMinutes())}`;
}

/** List recent Level-III scans for a site + product via S3 ListObjectsV2 (proxied in dev). */
export async function fetchLevel3Frames(
  stationId: string,
  productCode: string,
  maxFrames = 13,
): Promise<Level3Frame[]> {
  const sector = level3Sector(stationId);
  const prefix = `${sector}_${productCode}_`;
  const keys: string[] = [];
  let startAfter = recentLevel3StartAfter(prefix, level3ListingHours(maxFrames));

  for (let page = 0; page < 4 && keys.length < maxFrames * 2; page++) {
    const url =
      `${LEVEL3_S3_BASE}/?list-type=2&prefix=${encodeURIComponent(prefix)}` +
      `&max-keys=1000&start-after=${encodeURIComponent(startAfter)}`;
    const res = await fetch(url);
    if (!res.ok) break;
    const xml = await res.text();
    const re = /<Key>([^<]+)<\/Key>/g;
    let m: RegExpExecArray | null;
    const batch: string[] = [];
    while ((m = re.exec(xml))) batch.push(m[1]);
    if (!batch.length) break;
    keys.push(...batch);
    startAfter = batch[batch.length - 1];
  }

  return keys
    .slice(-maxFrames)
    .map((key) => ({ key, time: level3KeyToTime(key) }))
    .filter((f) => f.time > 0);
}
