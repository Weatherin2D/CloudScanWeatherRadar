import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchEcmwfTimeline,
  fetchModelGrid,
  boundsKey,
  type MapBounds,
  type ModelGridData,
} from "@/lib/modelGrid";
import {
  modelVariable,
  type ModelVariableId,
  PRESSURE_LEVELS,
  type PressureLevel,
} from "@/lib/ecmwfModels";

const REFRESH_TIMELINE_MS = 30 * 60 * 1000;
const BOUNDS_DEBOUNCE_MS = 900;

export function useEcmwfTimeline(enabled: boolean, forecastDays = 3) {
  const [times, setTimes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setError(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const t = await fetchEcmwfTimeline(forecastDays);
        if (!cancelled) setTimes(t);
      } catch (e) {
        if (!cancelled) {
          setTimes([]);
          setError(e instanceof Error ? e.message : "Failed to load forecast times");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const timer = setInterval(load, REFRESH_TIMELINE_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, forecastDays]);

  return { times, loading, error };
}

export function useEcmwfGrid(
  enabled: boolean,
  bounds: MapBounds | null,
  zoom: number,
  variableId: ModelVariableId,
  pressureLevelId: string,
) {
  const [grid, setGrid] = useState<ModelGridData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debouncedBounds, setDebouncedBounds] = useState<MapBounds | null>(bounds);
  const cacheRef = useRef<Map<string, ModelGridData>>(new Map());
  const requestRef = useRef(0);

  const variable = modelVariable(variableId);
  const pressureLevel: PressureLevel =
    PRESSURE_LEVELS.find((p) => p.id === pressureLevelId) ?? PRESSURE_LEVELS[0];

  useEffect(() => {
    if (!enabled || !bounds) {
      setDebouncedBounds(null);
      return;
    }
    const timer = setTimeout(() => setDebouncedBounds(bounds), BOUNDS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, bounds]);

  const load = useCallback(async () => {
    if (!enabled || !debouncedBounds) return;

    const reqId = ++requestRef.current;
    const key = `${boundsKey(debouncedBounds, zoom)}|${variableId}|${pressureLevelId}`;

    const cached = cacheRef.current.get(key);
    if (cached) {
      setGrid(cached);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchModelGrid(debouncedBounds, zoom, variable, pressureLevel);
      if (requestRef.current !== reqId) return;
      cacheRef.current.set(key, data);
      if (cacheRef.current.size > 12) {
        const first = cacheRef.current.keys().next().value;
        if (first) cacheRef.current.delete(first);
      }
      setGrid(data);
    } catch (e) {
      if (requestRef.current !== reqId) return;
      setGrid(null);
      setError(e instanceof Error ? e.message : "Failed to load model grid");
    } finally {
      if (requestRef.current === reqId) setLoading(false);
    }
  }, [enabled, debouncedBounds, zoom, variable, variableId, pressureLevel, pressureLevelId]);

  useEffect(() => {
    if (!enabled) {
      setGrid(null);
      setError(null);
      return;
    }
    load();
  }, [enabled, load]);

  return { grid, loading, error, reload: load };
}
