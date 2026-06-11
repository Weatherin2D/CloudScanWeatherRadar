/** ECMWF IFS forecast via Open-Meteo. */

export type ModelVariableId =
  | "precipitation"
  | "rain"
  | "cape"
  | "wind"
  | "gusts"
  | "temperature"
  | "dewpoint";

export type ModelFieldKind = "scalar" | "wind";

export interface ModelVariable {
  id: ModelVariableId;
  label: string;
  shortLabel: string;
  icon: string;
  kind: ModelFieldKind;
  /** Base hourly param(s) at surface / 10 m. */
  hourlyParams: string[];
  unit: string;
  palette: PaletteId;
  supportsPressure: boolean;
}

export type PaletteId =
  | "precipitation"
  | "cape"
  | "wind"
  | "temperature"
  | "dewpoint";

export interface PressureLevel {
  id: string;
  label: string;
  /** Surface uses 10m suffix; otherwise hPa suffix e.g. 850. */
  suffix: string;
}

export const ECMWF_MODEL_LABEL = "ECMWF IFS";

export const PRESSURE_LEVELS: PressureLevel[] = [
  { id: "surface", label: "Surface", suffix: "10m" },
  { id: "1000", label: "1000 hPa", suffix: "1000hPa" },
  { id: "925", label: "925 hPa", suffix: "925hPa" },
  { id: "850", label: "850 hPa", suffix: "850hPa" },
  { id: "700", label: "700 hPa", suffix: "700hPa" },
  { id: "500", label: "500 hPa", suffix: "500hPa" },
  { id: "300", label: "300 hPa", suffix: "300hPa" },
  { id: "250", label: "250 hPa", suffix: "250hPa" },
  { id: "200", label: "200 hPa", suffix: "200hPa" },
];

export const MODEL_VARIABLES: ModelVariable[] = [
  {
    id: "precipitation",
    label: "Rain, thunder",
    shortLabel: "Precip",
    icon: "🌧️",
    kind: "scalar",
    hourlyParams: ["precipitation", "cape"],
    unit: "mm",
    palette: "precipitation",
    supportsPressure: false,
  },
  {
    id: "rain",
    label: "Rain",
    shortLabel: "Rain",
    icon: "💧",
    kind: "scalar",
    hourlyParams: ["rain"],
    unit: "mm",
    palette: "precipitation",
    supportsPressure: false,
  },
  {
    id: "cape",
    label: "Thunder (CAPE)",
    shortLabel: "CAPE",
    icon: "⚡",
    kind: "scalar",
    hourlyParams: ["cape"],
    unit: "J/kg",
    palette: "cape",
    supportsPressure: false,
  },
  {
    id: "wind",
    label: "Wind",
    shortLabel: "Wind",
    icon: "💨",
    kind: "wind",
    hourlyParams: ["wind_speed_10m", "wind_direction_10m"],
    unit: "km/h",
    palette: "wind",
    supportsPressure: true,
  },
  {
    id: "gusts",
    label: "Wind gusts",
    shortLabel: "Gusts",
    icon: "🌬️",
    kind: "scalar",
    hourlyParams: ["wind_gusts_10m"],
    unit: "km/h",
    palette: "wind",
    supportsPressure: false,
  },
  {
    id: "temperature",
    label: "Temperature",
    shortLabel: "Temp",
    icon: "🌡️",
    kind: "scalar",
    hourlyParams: ["temperature_2m"],
    unit: "°C",
    palette: "temperature",
    supportsPressure: true,
  },
  {
    id: "dewpoint",
    label: "Dew point",
    shortLabel: "Dew",
    icon: "💦",
    kind: "scalar",
    hourlyParams: ["dew_point_2m"],
    unit: "°C",
    palette: "dewpoint",
    supportsPressure: false,
  },
];

export function modelVariable(id: ModelVariableId): ModelVariable {
  return MODEL_VARIABLES.find((v) => v.id === id) ?? MODEL_VARIABLES[0];
}

export function hourlyParamsFor(
  variable: ModelVariable,
  pressureLevel: PressureLevel,
): string[] {
  if (variable.id === "wind") {
    const s = pressureLevel.suffix;
    return [`wind_speed_${s}`, `wind_direction_${s}`];
  }
  if (variable.id === "temperature" && pressureLevel.id !== "surface") {
    return [`temperature_${pressureLevel.suffix}`];
  }
  if (variable.id === "gusts" || variable.id === "dewpoint") {
    return variable.hourlyParams;
  }
  return variable.hourlyParams;
}

export function scalarParamForDisplay(
  variable: ModelVariable,
  pressureLevel: PressureLevel,
): string {
  if (variable.id === "precipitation") return "precipitation";
  if (variable.id === "wind") return `wind_speed_${pressureLevel.suffix}`;
  if (variable.id === "temperature") {
    return pressureLevel.id === "surface" ? "temperature_2m" : `temperature_${pressureLevel.suffix}`;
  }
  return variable.hourlyParams[0];
}

export function ecmwfApiBase(): string {
  return import.meta.env.DEV ? "/api/open-meteo" : "https://api.open-meteo.com";
}

export function ecmwfForecastUrl(params: URLSearchParams): string {
  return `${ecmwfApiBase()}/v1/ecmwf?${params.toString()}`;
}

/** Color stops: [value, r, g, b] */
export const PALETTES: Record<PaletteId, { stops: [number, number, number, number][]; min: number; max: number }> = {
  precipitation: {
    min: 0,
    max: 25,
    stops: [
      [0, 180, 220, 255],
      [0.1, 100, 180, 255],
      [1, 50, 120, 220],
      [3, 80, 200, 80],
      [8, 255, 255, 0],
      [15, 255, 120, 0],
      [25, 255, 0, 0],
    ],
  },
  cape: {
    min: 0,
    max: 3000,
    stops: [
      [0, 200, 230, 255],
      [500, 180, 255, 180],
      [1000, 255, 255, 100],
      [1500, 255, 180, 50],
      [2000, 255, 80, 0],
      [3000, 255, 0, 120],
    ],
  },
  wind: {
    min: 0,
    max: 120,
    stops: [
      [0, 200, 220, 255],
      [10, 120, 200, 255],
      [25, 80, 180, 120],
      [50, 255, 255, 80],
      [80, 255, 140, 0],
      [120, 200, 0, 0],
    ],
  },
  temperature: {
    min: -30,
    max: 40,
    stops: [
      [-30, 80, 40, 160],
      [-10, 100, 150, 255],
      [0, 180, 220, 255],
      [10, 120, 220, 120],
      [20, 255, 220, 80],
      [30, 255, 140, 40],
      [40, 200, 40, 40],
    ],
  },
  dewpoint: {
    min: -20,
    max: 25,
    stops: [
      [-20, 100, 80, 160],
      [0, 120, 180, 255],
      [10, 100, 200, 180],
      [20, 255, 200, 100],
      [25, 255, 120, 60],
    ],
  },
};

export function valueToColor(
  paletteId: PaletteId,
  value: number | null | undefined,
  alpha = 200,
): [number, number, number, number] {
  if (value == null || Number.isNaN(value)) return [0, 0, 0, 0];
  const pal = PALETTES[paletteId];
  const v = Math.max(pal.min, Math.min(pal.max, value));
  const stops = pal.stops;
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ar, ag, ab] = stops[i];
    const [b, br, bg, bb] = stops[i + 1];
    if (v >= a && v <= b) {
      const t = b === a ? 0 : (v - a) / (b - a);
      return [
        Math.round(ar + t * (br - ar)),
        Math.round(ag + t * (bg - ag)),
        Math.round(ab + t * (bb - ab)),
        alpha,
      ];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3], alpha];
}

export function formatModelTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatModelHour(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
