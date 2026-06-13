/** Default animated frame count for global and station radar. */
export const DEFAULT_RADAR_FRAME_LIMIT = 13;

/** RainViewer global radar cap (historical past frames). */
export const MAX_GLOBAL_RADAR_FRAME_LIMIT = 13;

/** Per-station listing lookback window. */
export const STATION_RADAR_LOOKBACK_HOURS = 24;

/** Typical minutes between consecutive volume scans (NEXRAD / EU). */
export const STATION_RADAR_SCAN_INTERVAL_MINUTES = 5;

/** Max station frames ≈ one scan every 5 min over 24 h. */
export const MAX_STATION_RADAR_FRAME_LIMIT = Math.ceil(
  (STATION_RADAR_LOOKBACK_HOURS * 60) / STATION_RADAR_SCAN_INTERVAL_MINUTES,
);

export const MIN_RADAR_FRAME_LIMIT = 1;

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

/** Listing lookback in hours for a requested station frame count (up to 24 h). */
export function stationListingHours(frameCount: number): number {
  const frames = clampStationFrameLimit(frameCount);
  if (frames >= MAX_STATION_RADAR_FRAME_LIMIT) return STATION_RADAR_LOOKBACK_HOURS;
  return Math.max(
    STATION_RADAR_SCAN_INTERVAL_MINUTES / 60,
    (frames * STATION_RADAR_SCAN_INTERVAL_MINUTES) / 60,
  );
}

/** IEM listing window in minutes. */
export function iemListingMinutes(frameCount: number): number {
  return stationListingHours(frameCount) * 60;
}

/** @deprecated use stationListingHours */
export function level3ListingHours(frameCount: number): number {
  return stationListingHours(frameCount);
}
