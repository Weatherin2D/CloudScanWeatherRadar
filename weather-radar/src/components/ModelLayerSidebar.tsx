import {
  CloudRain,
  Droplets,
  Zap,
  Wind,
  Gauge,
  Thermometer,
  CloudFog,
} from "lucide-react";
import {
  MODEL_VARIABLES,
  PALETTES,
  type ModelVariableId,
} from "@/lib/ecmwfModels";

const ICONS: Record<ModelVariableId, typeof Wind> = {
  precipitation: CloudRain,
  rain: Droplets,
  cape: Zap,
  wind: Wind,
  gusts: Gauge,
  temperature: Thermometer,
  dewpoint: CloudFog,
};

interface Props {
  active: ModelVariableId;
  onSelect: (id: ModelVariableId) => void;
}

export default function ModelLayerSidebar({ active, onSelect }: Props) {
  return (
    <div className="absolute top-3 right-3 z-[600] flex flex-col gap-1 pointer-events-auto">
      {MODEL_VARIABLES.map((v) => {
        const Icon = ICONS[v.id];
        const selected = active === v.id;
        return (
          <button
            key={v.id}
            onClick={() => onSelect(v.id)}
            title={v.label}
            className={`flex items-center gap-2 pl-2 pr-3 py-2 rounded-full border shadow-lg backdrop-blur transition-all text-left min-w-[8.5rem] ${
              selected
                ? "bg-blue-600/90 border-blue-400 text-white"
                : "bg-gray-900/85 border-gray-700 text-gray-300 hover:bg-gray-800/90 hover:text-white"
            }`}
          >
            <span
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                selected ? "bg-blue-500/50" : "bg-gray-800"
              }`}
            >
              <Icon className="w-4 h-4" />
            </span>
            <span className="text-xs font-medium leading-tight">{v.label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface LegendProps {
  variableId: ModelVariableId;
  unit: string;
}

export function ModelFieldLegend({ variableId, unit }: LegendProps) {
  const variable = MODEL_VARIABLES.find((v) => v.id === variableId)!;
  const pal = PALETTES[variable.palette];
  const gradient = pal.stops
    .map(([v, r, g, b]) => `rgb(${r},${g},${b}) ${((v - pal.min) / (pal.max - pal.min)) * 100}%`)
    .join(", ");

  return (
    <div className="bg-gray-900/90 backdrop-blur rounded-xl px-3 py-2 border border-gray-700 pointer-events-auto text-xs min-w-[10rem]">
      <p className="text-gray-300 font-medium mb-1">{variable.label}</p>
      <div className="h-2.5 w-full rounded" style={{ background: `linear-gradient(to right, ${gradient})` }} />
      <div className="flex justify-between mt-1 text-gray-500">
        <span>{pal.min}{unit === "°C" ? "°" : ""}</span>
        <span>{pal.max}{unit === "°C" ? "°" : ""}</span>
      </div>
      <p className="text-[10px] text-gray-600 mt-1">{unit}</p>
    </div>
  );
}
