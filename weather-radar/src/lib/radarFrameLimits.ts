/** Shared radar history window and frame-limit helpers. */
export const DEFAULT_RADAR_FRAME_LIMIT = 13;

export const RADAR_LOOKBACK_HOURS = 24;

/** RainViewer global mosaic cadence (minutes). */
export const GLOBAL_RADAR_SCAN_INTERVAL_MINUTES = 10;

/** NEXRAD / IEM composite cadence (minutes). */
export const STATION_RADAR_SCAN_INTERVAL_MINUTES = 5;

/** @deprecated use RADAR_LOOKBACK_HOURS */
export const STATION_RADAR_LOOKBACK_HOURS = RADAR_LOOKBACK_HOURS;

export const MAX_GLOBAL_RADAR_FRAME_LIMIT = Math.ceil(
  (RADAR_LOOKBACK_HOURS * 60) / STATION_RADAR_SCAN_INTERVAL_MINUTES,
);

export const MAX_STATION_RADAR_FRAME_LIMIT = MAX_GLOBAL_RADAR_FRAME_LIMIT;

export const MIN_RADAR_FRAME_LIMIT = 1;

function listingHoursForLimit(frameCount: number, maxFrames: number): number {
  const frames = Math.min(maxFrames, Math.max(MIN_RADAR_FRAME_LIMIT, frameCount));
  if (frames >= maxFrames) return RADAR_LOOKBACK_HOURS;
  return Math.max(
    STATION_RADAR_SCAN_INTERVAL_MINUTES / 60,
    (frames * STATION_RADAR_SCAN_INTERVAL_MINUTES) / 60,
  );
}

export function clampGlobalFrameLimit(
  limit: number,
  available = MAX_GLOBAL_RADAR_FRAME_LIMIT,
): number {
  const cap = Math.max(MIN_RADAR_FRAME_LIMIT, available);
  return Math.min(
    MAX_GLOBAL_RADAR_FRAME_LIMIT,
    Math.max(MIN_RADAR_FRAME_LIMIT, limit),
    cap,
  );
}

export function clampStationFrameLimit(
  limit: number,
  available = MAX_STATION_RADAR_FRAME_LIMIT,
): number {
  const cap = Math.max(MIN_RADAR_FRAME_LIMIT, available);
  return Math.min(
    MAX_STATION_RADAR_FRAME_LIMIT,
    Math.max(MIN_RADAR_FRAME_LIMIT, limit),
    cap,
  );
}

export function sliceRecentGlobalFrames<T>(frames: T[], limit: number): T[] {
  if (!frames.length) return [];
  return frames.slice(-clampGlobalFrameLimit(limit, frames.length));
}

export function sliceRecentFrames<T>(frames: T[], limit: number): T[] {
  if (!frames.length) return [];
  return frames.slice(-clampStationFrameLimit(limit, frames.length));
}

export function globalListingHours(frameCount: number): number {
  return listingHoursForLimit(frameCount, MAX_GLOBAL_RADAR_FRAME_LIMIT);
}

export function stationListingHours(frameCount: number): number {
  return listingHoursForLimit(frameCount, MAX_STATION_RADAR_FRAME_LIMIT);
}

/** IEM listing window in minutes. */
export function iemListingMinutes(frameCount: number): number {
  return stationListingHours(frameCount) * 60;
}

/** Short IEM listing window for a fast first response (~15 frames at 5 min). */
export const IEM_FAST_LIST_MINUTES = 75;

export function iemFastListingMinutes(frameCount: number): number {
  return Math.min(IEM_FAST_LIST_MINUTES, iemListingMinutes(frameCount));
}

/** @deprecated use stationListingHours */
export function level3ListingHours(frameCount: number): number {
  return stationListingHours(frameCount);
}

/** Human-readable lookback for a frame count (e.g. "1 h 5 min", "24 h"). */
export function formatRadarFrameDuration(
  frameCount: number,
  intervalMinutes = STATION_RADAR_SCAN_INTERVAL_MINUTES,
): string {
  const frames = Math.max(MIN_RADAR_FRAME_LIMIT, Math.floor(frameCount));
  const totalMin = frames * intervalMinutes;
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (mins === 0) return `${hours} h`;
  return `${hours} h ${mins} min`;
}
