import {
  globalListingHours,
  sliceRecentGlobalFrames,
} from "@/lib/radarFrameLimits";
import { iemScanIsoToTms } from "@/lib/iemRadar";

const LIST_URL = "https://mesonet.agron.iastate.edu/json/radar.py";
const RAINVIEWER_URL = "https://api.rainviewer.com/public/weather-maps.json";

/** IEM nationwide base-reflectivity composite used to extend global history. */
export const GLOBAL_IEM_RADAR = "USCOMP";
export const GLOBAL_IEM_PRODUCT = "N0B";

export interface GlobalRadarFrame {
  time: number;
  /** RainViewer worldwide mosaic (recent ~2 h). */
  rainViewerPath?: string;
  /** IEM US composite TMS id (up to 24 h). */
  iemTmsId?: string;
}

function toIemIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function fetchRainViewerPast(): Promise<{ time: number; path: string }[]> {
  const res = await fetch(RAINVIEWER_URL);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.radar?.past ?? []).map((f: { time: number; path: string }) => ({
    time: f.time,
    path: f.path,
  }));
}

async function fetchIemCompositeScans(listingMinutes: number): Promise<{ ts: string }[]> {
  const end = toIemIso(new Date());
  const start = toIemIso(new Date(Date.now() - listingMinutes * 60 * 1000));
  const params = new URLSearchParams({
    operation: "list",
    radar: GLOBAL_IEM_RADAR,
    product: GLOBAL_IEM_PRODUCT,
    start,
    end,
  });
  const res = await fetch(`${LIST_URL}?${params}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.scans ?? [];
}

function nearestRainViewerPath(
  time: number,
  rainViewer: { time: number; path: string }[],
): string | undefined {
  let best: { time: number; path: string } | undefined;
  let bestDelta = Infinity;
  for (const frame of rainViewer) {
    const delta = Math.abs(frame.time - time);
    if (delta <= 300 && delta < bestDelta) {
      best = frame;
      bestDelta = delta;
    }
  }
  return best?.path;
}

/** RainViewer for recent worldwide data + IEM US composite for up to 24 h of history. */
export async function fetchGlobalRadarFrames(
  frameCount: number,
): Promise<GlobalRadarFrame[]> {
  const listingMinutes = globalListingHours(frameCount) * 60;
  const [rainViewer, iemScans] = await Promise.all([
    fetchRainViewerPast(),
    fetchIemCompositeScans(listingMinutes),
  ]);

  const byTime = new Map<number, GlobalRadarFrame>();

  for (const scan of iemScans) {
    const time = Math.floor(new Date(scan.ts).getTime() / 1000);
    byTime.set(time, {
      time,
      iemTmsId: iemScanIsoToTms(scan.ts),
      rainViewerPath: nearestRainViewerPath(time, rainViewer),
    });
  }

  for (const frame of rainViewer) {
    const existing = [...byTime.values()].find((f) => Math.abs(f.time - frame.time) <= 300);
    if (existing) {
      existing.rainViewerPath = frame.path;
      existing.time = frame.time;
    } else {
      byTime.set(frame.time, { time: frame.time, rainViewerPath: frame.path });
    }
  }

  const merged = [...byTime.values()].sort((a, b) => a.time - b.time);
  return sliceRecentGlobalFrames(merged, frameCount);
}
