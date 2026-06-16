import { proxiedApiBase } from "./apiProxy";

export type EsslOutlookType = "paramcombi24" | "paramcombi3";

export const ESSL_OUTLOOK_LABELS: Record<EsslOutlookType, string> = {
  paramcombi24: "Large Hail and Lightning 24h",
  paramcombi3: "Large Hail and Lightning 3h",
};

const STORMFORECAST_PROXY_BASE = "/api/stormforecast";
const STORMFORECAST_ORIGIN = "https://stormforecast.eu";
const STORMFORECAST_BASE = proxiedApiBase(STORMFORECAST_PROXY_BASE, STORMFORECAST_ORIGIN);

function formatStormForecastUrl(rawUrl: string): string {
  const url = rawUrl.startsWith("http")
    ? new URL(rawUrl)
    : new URL(rawUrl, STORMFORECAST_ORIGIN);

  if (STORMFORECAST_BASE.startsWith("/api/")) {
    return `${STORMFORECAST_PROXY_BASE}${url.pathname}${url.search}`;
  }

  return url.toString();
}

export async function fetchEsslOutlookUrl(type: EsslOutlookType): Promise<string | null> {
  const dtg = await fetchLatestDtg();
  if (!dtg) return null;

  const mapTypes = await fetchMapTypes(dtg);
  if (!mapTypes.includes(type)) return null;

  const urls = await fetchMapTimesAndUrls(dtg, type);
  if (!urls?.length) return null;

  // Use the latest valid time for the selected outlook type.
  return formatStormForecastUrl(urls[urls.length - 1].mapUrl);
}

async function fetchLatestDtg(): Promise<string | null> {
  const res = await fetch(`${STORMFORECAST_BASE}/storm_query_2.php?q=getlast0012init`);
  if (!res.ok) return null;
  return res.text().then((text) => text.trim());
}

async function fetchMapTypes(dtg: string): Promise<EsslOutlookType[]> {
  const res = await fetch(`${STORMFORECAST_BASE}/storm_query_2.php?q=getmaptypes&dtg=${dtg}`);
  if (!res.ok) return [];
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((value): value is EsslOutlookType => value === "paramcombi24" || value === "paramcombi3");
}

interface MapTimeUrl {
  valid: string;
  mapUrl: string;
  verifUrl: string;
}

async function fetchMapTimesAndUrls(dtg: string, type: EsslOutlookType): Promise<MapTimeUrl[] | null> {
  const res = await fetch(
    `${STORMFORECAST_BASE}/storm_query_2.php?q=getmaptimesandurls&dtg=${dtg}&maptype=${type}`,
  );
  if (!res.ok) return null;
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [valid, mapUrl, verifUrl] = line.split(/\s+/);
      return { valid, mapUrl, verifUrl };
    })
    .filter((entry) => entry.mapUrl);
}
