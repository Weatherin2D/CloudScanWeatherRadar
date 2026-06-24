import {
  EMPTY_GEOJSON,
  mergeGeoJson,
  type GeoJsonFeatureCollection,
} from "@/lib/geoJson";
import {
  fetchIfrcAlerts,
  type AlertFeatureProperties,
  type AlertSeverity,
} from "@/lib/weatherAlerts";
import {
  normalizeSpcGeoJson,
  spcOutlookUrl,
  SPC_RISK_LEGEND,
  formatOutlookIssue,
  type OutlookDay,
  type SpcOutlookProperties,
} from "@/lib/spcOutlook";
import { proxiedApiBase } from "./apiProxy";

export type { OutlookDay } from "@/lib/spcOutlook";
export { SPC_RISK_LEGEND, formatOutlookIssue };

export type ConvectiveRiskSource = "spc" | "mesocast" | "europe";

/** MesoCast UK/Ireland day-1 convective outlook levels. */
export const MESOCAST_RISK_LEGEND = [
  { key: "marginal", label: "VLOW", name: "Very Low", fill: "#C1E0C1", stroke: "#55AA55" },
  { key: "slight", label: "LOW", name: "Low", fill: "#FFE066", stroke: "#DDAA00" },
  { key: "enhanced", label: "SLGT", name: "Slight", fill: "#FFAA66", stroke: "#FF6600" },
  { key: "moderate", label: "MDT", name: "Moderate", fill: "#FF6666", stroke: "#DD0000" },
  { key: "high", label: "HIGH", name: "High", fill: "#FF00FF", stroke: "#AA00AA" },
  { key: "very_high", label: "VHIGH", name: "Very High", fill: "#CC00CC", stroke: "#880088" },
] as const;

export interface ConvectiveRiskProperties extends SpcOutlookProperties {
  riskSource?: ConvectiveRiskSource;
  risk?: string;
  country?: string;
  event?: string;
  isConditional?: boolean;
  isHatched?: boolean;
}

function mesoCastBaseUrl(): string {
  return proxiedApiBase("/api/mesocast", "https://mesocast.uk");
}

export function mesoCastOutlookUrl(day: OutlookDay = 1): string {
  return `${mesoCastBaseUrl()}/wp-json/metconvect-nowcast/v1/day${day}`;
}

const EUROPEAN_COUNTRY_NAMES = new Set([
  "albania",
  "andorra",
  "austria",
  "belarus",
  "belgium",
  "bosnia and herzegovina",
  "bulgaria",
  "croatia",
  "cyprus",
  "czechia",
  "czech republic",
  "denmark",
  "estonia",
  "finland",
  "france",
  "germany",
  "greece",
  "hungary",
  "iceland",
  "ireland",
  "italy",
  "kosovo",
  "latvia",
  "liechtenstein",
  "lithuania",
  "luxembourg",
  "malta",
  "moldova",
  "monaco",
  "montenegro",
  "netherlands",
  "north macedonia",
  "norway",
  "poland",
  "portugal",
  "romania",
  "san marino",
  "serbia",
  "slovakia",
  "slovenia",
  "spain",
  "sweden",
  "switzerland",
  "ukraine",
  "united kingdom",
  "vatican city",
  "great britain",
  "england",
  "scotland",
  "wales",
  "northern ireland",
  "uk",
  "gb",
]);

function isEuropeanCountry(country?: string | null): boolean {
  if (!country) return false;
  return EUROPEAN_COUNTRY_NAMES.has(country.trim().toLowerCase());
}

function isConvectiveEvent(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(thunderstorm|lightning|hail|severe weather|gewitter|unwetter|orage|tempête|tempete|storm warning|storm forecast|convective|supercell|tornado|grainsize|foudre|blitz|heavy rain|heavy rainfall|flash flood|flash flooding|strong wind|strong winds|violent storm|violent storms|extreme weather|dangerous weather|adverse weather|storm|storms|thunder|thunders|tornados|tornadoes|hailstorm|hailstorms|downburst|downbursts|squall line|squall lines|mesocyclone|mesocyclones|wall cloud|wall clouds|funnel cloud|funnel clouds|waterspout|waterspouts|damaging wind|damaging winds|large hail|severe thunderstorm|severe thunderstorms)\b/.test(
    lower,
  );
}

function mesoCastLegendForRisk(risk: string) {
  return MESOCAST_RISK_LEGEND.find((r) => r.key === risk) ?? MESOCAST_RISK_LEGEND[0];
}

function severityColors(severity: AlertSeverity): { fill: string; stroke: string; label: string } {
  switch (severity) {
    case "EXTREME":
      return { fill: "#FF00FF", stroke: "#AA00AA", label: "Extreme" };
    case "SEVERE":
      return { fill: "#FF6666", stroke: "#DD0000", label: "Severe" };
    case "MODERATE":
      return { fill: "#FFAA66", stroke: "#FF6600", label: "Moderate" };
    case "MINOR":
      return { fill: "#FFE066", stroke: "#DDAA00", label: "Minor" };
    default:
      return { fill: "#C1E0C1", stroke: "#55AA55", label: "Alert" };
  }
}

export function normalizeMesoCastGeoJson(raw: unknown): GeoJsonFeatureCollection {
  const data = raw as GeoJsonFeatureCollection;
  if (!data?.features?.length) return EMPTY_GEOJSON;

  return {
    type: "FeatureCollection",
    features: data.features.map((feature, index) => {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const risk = String(props.risk ?? "marginal");
      const title = String(props.title ?? mesoCastLegendForRisk(risk).label);
      const legend = mesoCastLegendForRisk(risk);
      const isConditional = Boolean(props.conditional);
      const isHatched = Boolean(props.hatched);

      return {
        ...feature,
        id: feature.id ?? `mesocast-${index}`,
        properties: {
          riskSource: "mesocast",
          risk,
          LABEL: title,
          LABEL2: `${legend.name}${isConditional ? " (Conditional)" : ""}${isHatched ? " (Hatched)" : ""} · MesoCast`,
          fill: legend.fill,
          stroke: legend.stroke,
          isConditional,
          isHatched,
        } satisfies ConvectiveRiskProperties,
      };
    }),
  };
}

export function normalizeEuropeanConvectiveAlerts(
  geojson: GeoJsonFeatureCollection,
): GeoJsonFeatureCollection {
  const features = geojson.features
    .filter((feature) => {
      const props = feature.properties as AlertFeatureProperties | undefined;
      if (!props) return false;
      const isEuro = isEuropeanCountry(props.country);
      const isConv = isConvectiveEvent(`${props.event} ${props.headline ?? ""}`);
      return isEuro && isConv;
    })
    .map((feature, index) => {
      const props = feature.properties as unknown as AlertFeatureProperties;
      const colors = severityColors(props.severity);
      const area = props.area ? ` · ${props.area}` : "";

      return {
        ...feature,
        id: feature.id ?? `eu-convective-${index}`,
        properties: {
          riskSource: "europe",
          LABEL: colors.label,
          LABEL2: `${props.event}${area} · ${props.country ?? "Europe"}`,
          fill: colors.fill,
          stroke: colors.stroke,
          country: props.country,
          event: props.event,
          VALID_ISO: props.expires,
        } satisfies ConvectiveRiskProperties,
      };
    });

  console.log("[Europe Risk] Final European convective features:", features.length);
  return { type: "FeatureCollection", features };
}

export function riskStyleForFeature(
  props: ConvectiveRiskProperties | null | undefined,
  opacity: number,
): { fillColor: string; color: string; fillOpacity: number; weight: number; dashArray?: string } {
  const label = props?.LABEL ?? "";
  const spcLegend = SPC_RISK_LEGEND.find((r) => r.label === label);
  const mesoLegend = props?.risk
    ? mesoCastLegendForRisk(props.risk)
    : MESOCAST_RISK_LEGEND.find((r) => r.label === label);

  const fill = props?.fill ?? spcLegend?.fill ?? mesoLegend?.fill ?? "#888888";
  const stroke = props?.stroke ?? spcLegend?.stroke ?? mesoLegend?.stroke ?? "#666666";
  const isEuropeAlert = props?.riskSource === "europe";
  const isMesoCast = props?.riskSource === "mesocast";
  const isConditional = props?.isConditional;
  const isHatched = props?.isHatched;

  let dashArray: string | undefined;
  if (isEuropeAlert) {
    dashArray = "5 4";
  } else if (isMesoCast && isConditional) {
    dashArray = "8 4";
  } else if (isMesoCast && isHatched) {
    dashArray = "4 2";
  }

  return {
    fillColor: fill,
    color: stroke,
    fillOpacity: opacity * (isEuropeAlert ? 0.35 : 0.45),
    weight: isEuropeAlert ? 2 : 2,
    dashArray,
  };
}

export interface ConvectiveRiskOutlook {
  geojson: GeoJsonFeatureCollection;
  issueTime: string | null;
  validTime: string | null;
  expireTime: string | null;
  forecaster: string | null;
  sources: string[];
  featureCounts: { spc: number; mesocast: number; europe: number };
}

async function fetchSpcOutlook(day: OutlookDay): Promise<GeoJsonFeatureCollection> {
  const res = await fetch(spcOutlookUrl(day));
  if (!res.ok) throw new Error(`US outlook unavailable (${res.status})`);
  const raw = await res.json();
  const geojson = normalizeSpcGeoJson(raw);

  return {
    type: "FeatureCollection",
    features: geojson.features.map((feature, index) => ({
      ...feature,
      id: feature.id ?? `spc-${day}-${index}`,
      properties: {
        ...(feature.properties as SpcOutlookProperties),
        riskSource: "spc",
      } satisfies ConvectiveRiskProperties,
    })),
  };
}

async function fetchMesoCastOutlook(day: OutlookDay): Promise<GeoJsonFeatureCollection> {
  const res = await fetch(mesoCastOutlookUrl(day), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`MesoCast outlook unavailable (${res.status})`);
  const raw = await res.json();
  return normalizeMesoCastGeoJson(raw);
}

async function fetchEuropeanConvectiveOutlook(): Promise<GeoJsonFeatureCollection> {
  const { geojson } = await fetchIfrcAlerts();
  return normalizeEuropeanConvectiveAlerts(geojson);
}

export async function fetchConvectiveRiskOutlook(day: OutlookDay): Promise<ConvectiveRiskOutlook> {
  const [spcResult, mesocastResult, europeResult] = await Promise.allSettled([
    fetchSpcOutlook(day),
    fetchMesoCastOutlook(day),
    fetchEuropeanConvectiveOutlook(),
  ]);

  const spc =
    spcResult.status === "fulfilled" ? spcResult.value : EMPTY_GEOJSON;
  const mesocast =
    mesocastResult.status === "fulfilled" ? mesocastResult.value : EMPTY_GEOJSON;
  const europe =
    europeResult.status === "fulfilled" ? europeResult.value : EMPTY_GEOJSON;

  const geojson = mergeGeoJson(spc, mesocast, europe);
  const totalFeatures = geojson.features.length;

  // Only throw error if SPC (primary source) fails and no other data is available
  if (totalFeatures === 0 && spcResult.status === "rejected") {
    const errors = [spcResult, mesocastResult, europeResult]
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
    throw new Error(errors[0] ?? "Convective risk data unavailable");
  }

  const spcProps = spc.features[0]?.properties as SpcOutlookProperties | undefined;
  const sources: string[] = [];
  if (spc.features.length) sources.push(`NOAA SPC Day ${day}`);
  if (mesocast.features.length) sources.push("MesoCast");
  if (europe.features.length) sources.push("MeteoAlarm Europe");

  return {
    geojson,
    issueTime: formatOutlookIssue(spcProps?.ISSUE_ISO),
    validTime: formatOutlookIssue(spcProps?.VALID_ISO),
    expireTime: formatOutlookIssue(spcProps?.EXPIRE_ISO),
    forecaster: spcProps?.FORECASTER ?? null,
    sources,
    featureCounts: {
      spc: spc.features.length,
      mesocast: mesocast.features.length,
      europe: europe.features.length,
    },
  };
}
