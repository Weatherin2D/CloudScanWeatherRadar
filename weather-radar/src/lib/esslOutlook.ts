import { proxiedApiBase } from "./apiProxy";

export type EsslOutlookType = "paramcombi24" | "paramcombi3";

export const ESSL_OUTLOOK_LABELS: Record<EsslOutlookType, string> = {
  paramcombi24: "Large Hail and Lightning 24h",
  paramcombi3: "Large Hail and Lightning 3h",
};

const STORMFORECAST_PROXY_BASE = "/api/stormforecast";
const STORMFORECAST_ORIGIN = "https://stormforecast.eu";
const CORS_PROXY = "https://api.codetabs.com/v1/proxy?quest=";

// In dev/local: use Express proxy. In production (GitHub Pages): use CORS proxy.
function getStormForecastBase(): string {
  if (import.meta.env.DEV) {
    return STORMFORECAST_PROXY_BASE;
  }
  // Production: use public CORS proxy to bypass CORS restrictions
  return STORMFORECAST_ORIGIN;
}

const STORMFORECAST_BASE = getStormForecastBase();

function formatStormForecastUrl(rawUrl: string): string {
  const url = rawUrl.startsWith("http")
    ? new URL(rawUrl)
    : new URL(rawUrl, STORMFORECAST_ORIGIN);

  if (STORMFORECAST_BASE.startsWith("/api/")) {
    return `${STORMFORECAST_PROXY_BASE}${url.pathname}${url.search}`;
  }

  // Always use CORS proxy for stormforecast.eu requests (both dev and prod)
  // since the server has strict CORS policy
  return `${CORS_PROXY}${encodeURIComponent(url.toString())}`;
}

export async function fetchEsslOutlookUrl(type: EsslOutlookType): Promise<string | null> {
  try {
    const dtg = await fetchLatestDtg();
    if (!dtg) {
      console.error("ESSL outlook: No latest DTG available");
      return null;
    }

    const mapTypes = await fetchMapTypes(dtg);
    if (!mapTypes.includes(type)) {
      console.error(`ESSL outlook: Map type ${type} not available`);
      return null;
    }

    const urls = await fetchMapTimesAndUrls(dtg, type);
    if (!urls?.length) {
      console.error(`ESSL outlook: No map times/URLs for ${type}`);
      return null;
    }

    // Use the latest valid time for the selected outlook type.
    return formatStormForecastUrl(urls[urls.length - 1].mapUrl);
  } catch (err) {
    // Return null instead of throwing to allow the app to continue
    const msg = err instanceof Error ? err.message : String(err);
    console.error("ESSL outlook fetch failed:", msg);
    return null;
  }
}

async function fetchLatestDtg(): Promise<string | null> {
  try {
    const url = formatStormForecastUrl("/storm_query_2.php?q=getlast0012init");
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`getlast0012init returned ${res.status}`);
    }
    const text = await res.text();
    const trimmed = text.trim();
    return trimmed || null;
  } catch (err) {
    console.error("Failed to fetch latest DTG:", err);
    return null;
  }
}

async function fetchMapTypes(dtg: string): Promise<EsslOutlookType[]> {
  const url = formatStormForecastUrl(`/storm_query_2.php?q=getmaptypes&dtg=${dtg}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`getmaptypes returned ${res.status}`);
  }
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((value): value is EsslOutlookType => value === "paramcombi24" || value === "paramcombi3");
}

interface MapTimeUrl {
  valid: string;
  mapUrl: string;
  verifUrl: string;
}

async function fetchMapTimesAndUrls(dtg: string, type: EsslOutlookType): Promise<MapTimeUrl[] | null> {
  const url = formatStormForecastUrl(`/storm_query_2.php?q=getmaptimesandurls&dtg=${dtg}&maptype=${type}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`getmaptimesandurls returned ${res.status}`);
  }
  const text = await res.text();
  const lines = text
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  return lines
    .map((line) => {
      const [valid, mapUrl, verifUrl] = line.split(/\s+/);
      return { valid, mapUrl, verifUrl };
    })
    .filter((entry) => entry.mapUrl);
}
