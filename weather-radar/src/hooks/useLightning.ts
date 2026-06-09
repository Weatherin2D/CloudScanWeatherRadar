import { useState, useEffect, useRef } from "react";
import { decodeBlitzortungPayload, wsDataToString } from "@/lib/blitzortung";

export interface LightningStrike {
  lat: number;
  lon: number;
  time: number;
  id: string;
}

const STRIKE_TTL = 60 * 60 * 1000;
const MAX_STRIKES = 20_000;
const FLUSH_MS = 100;
const KEEPALIVE_MS = 30_000;

const SOCKET_HOSTS = ["ws1", "ws2", "ws3", "ws7", "ws8"];

/** Retain strikes across lightning toggle so re-enabling shows recent activity. */
let strikeCache: LightningStrike[] = [];

function strikeKey(s: LightningStrike): string {
  return `${s.time}:${s.lat.toFixed(4)}:${s.lon.toFixed(4)}`;
}

function coordFromRecord(rec: Record<string, unknown>): { lat: number; lon: number } | null {
  const latRaw = rec.lat ?? rec.latitude;
  const lonRaw = rec.lon ?? rec.longitude;
  if (latRaw == null || lonRaw == null) return null;

  let lat = Number(latRaw);
  let lon = Number(lonRaw);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

  if (Math.abs(lat) > 90) lat /= 1e7;
  if (Math.abs(lon) > 180) lon /= 1e7;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return { lat, lon };
}

function strikeTimeFromRecord(rec: Record<string, unknown>): number {
  const raw = rec.time ?? rec.timestamp;
  if (raw == null) return Date.now();

  const n = Number(raw);
  if (Number.isNaN(n)) return Date.now();

  // Nanoseconds since epoch (live Blitzortung feed).
  if (n > 1e15) return Math.floor(n / 1e6);
  // Milliseconds since epoch.
  if (n > 1e12) return Math.floor(n);
  // Seconds since epoch.
  if (n > 1e9) return Math.floor(n * 1000);

  return Date.now();
}

function strikeFromRecord(
  rec: Record<string, unknown>,
  idxRef: { current: number },
): LightningStrike | null {
  const coords = coordFromRecord(rec);
  if (!coords) return null;

  const time = strikeTimeFromRecord(rec);
  return {
    lat: coords.lat,
    lon: coords.lon,
    time,
    id: `${time}-${coords.lat.toFixed(4)}-${coords.lon.toFixed(4)}-${idxRef.current++}`,
  };
}

function parseStrikePayload(raw: string, idxRef: { current: number }): LightningStrike[] {
  const data = decodeBlitzortungPayload(raw);
  if (!data) return [];

  if (Array.isArray(data)) {
    return data.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const strike = strikeFromRecord(item as Record<string, unknown>, idxRef);
      return strike ? [strike] : [];
    });
  }

  if (typeof data !== "object") return [];

  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.strokes)) {
    return obj.strokes.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const strike = strikeFromRecord(item as Record<string, unknown>, idxRef);
      return strike ? [strike] : [];
    });
  }

  const strike = strikeFromRecord(obj, idxRef);
  return strike ? [strike] : [];
}

function mergeStrikes(prev: LightningStrike[], incoming: LightningStrike[]): LightningStrike[] {
  if (!incoming.length) return prev;

  const now = Date.now();
  const seen = new Set<string>();
  const merged: LightningStrike[] = [];

  for (const s of prev) {
    if (now - s.time >= STRIKE_TTL) continue;
    const key = strikeKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(s);
  }

  for (const s of incoming) {
    const key = strikeKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(s);
  }

  return merged.length > MAX_STRIKES ? merged.slice(-MAX_STRIKES) : merged;
}

function pickSocketHosts(count: number): string[] {
  const shuffled = [...SOCKET_HOSTS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function useLightning(enabled: boolean) {
  const [strikes, setStrikes] = useState<LightningStrike[]>(strikeCache);
  const pendingRef = useRef<LightningStrike[]>([]);
  const idxRef = useRef(0);
  const socketsRef = useRef<WebSocket[]>([]);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (keepaliveRef.current) clearInterval(keepaliveRef.current);
      socketsRef.current.forEach((ws) => ws.close());
      socketsRef.current = [];
      return;
    }

    const idx = { current: idxRef.current };
    let closed = false;

    const applyStrikes = (next: LightningStrike[]) => {
      strikeCache = next;
      setStrikes(next);
    };

    const flushPending = () => {
      if (!pendingRef.current.length) return;
      const batch = pendingRef.current;
      pendingRef.current = [];
      applyStrikes(mergeStrikes(strikeCache, batch));
    };

    const flushTimer = setInterval(flushPending, FLUSH_MS);

    const connectSocket = (host: string) => {
      try {
        const ws = new WebSocket(`wss://${host}.blitzortung.org/`);
        ws.binaryType = "arraybuffer";

        ws.onopen = () => {
          try {
            ws.send(JSON.stringify({ a: 111 }));
          } catch {
            /* ignore */
          }
        };

        ws.onmessage = async (event) => {
          const raw = await wsDataToString(event.data as string | Blob | ArrayBuffer);
          if (!raw) return;
          const parsed = parseStrikePayload(raw, idx);
          if (parsed.length) pendingRef.current.push(...parsed);
        };

        ws.onerror = () => ws.close();
        socketsRef.current.push(ws);
      } catch {
        /* ignore single host failure */
      }
    };

    const connect = () => {
      if (closed) return;
      socketsRef.current.forEach((ws) => ws.close());
      socketsRef.current = [];

      for (const host of pickSocketHosts(3)) {
        connectSocket(host);
      }

      if (keepaliveRef.current) clearInterval(keepaliveRef.current);
      keepaliveRef.current = setInterval(() => {
        for (const ws of socketsRef.current) {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ a: 542 }));
            } catch {
              /* ignore */
            }
          }
        }
      }, KEEPALIVE_MS);
    };

    const scheduleReconnect = () => {
      if (closed || reconnectRef.current) return;
      reconnectRef.current = setTimeout(() => {
        reconnectRef.current = null;
        connect();
      }, 3000);
    };

    const watchSockets = setInterval(() => {
      if (closed) return;
      const open = socketsRef.current.filter((ws) => ws.readyState === WebSocket.OPEN);
      if (open.length === 0 && socketsRef.current.length > 0) {
        scheduleReconnect();
      }
    }, 5000);

    connect();
    idxRef.current = idx.current;

    // Show any strikes retained from a prior session immediately.
    if (strikeCache.length) applyStrikes(strikeCache);

    const cleanupTimer = setInterval(() => {
      const now = Date.now();
      applyStrikes(strikeCache.filter((s) => now - s.time < STRIKE_TTL));
    }, 60_000);

    return () => {
      closed = true;
      clearInterval(flushTimer);
      clearInterval(cleanupTimer);
      clearInterval(watchSockets);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (keepaliveRef.current) clearInterval(keepaliveRef.current);
      flushPending();
      socketsRef.current.forEach((ws) => ws.close());
      socketsRef.current = [];
    };
  }, [enabled]);

  return strikes;
}
