/** Default animated frame count for global and station radar. */
export const DEFAULT_RADAR_FRAME_LIMIT = 13;

/** RainViewer global radar cap (historical past frames). */
export const MAX_GLOBAL_RADAR_FRAME_LIMIT = 13;

/** Per-station radar slider/fetch cap (IEM, Level-III, OPERA). */
export const MAX_STATION_RADAR_FRAME_LIMIT = 20;

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

/** IEM listing window: ~6 min between volume scans. */
export function iemListingMinutes(frameCount: number): number {
  return Math.max(90, frameCount * 6 + 30);
}

/** Level-III / OPERA listing lookback in hours. */
export function level3ListingHours(frameCount: number): number {
  return Math.max(2, frameCount * 0.12);
}
