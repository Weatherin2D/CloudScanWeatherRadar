import { Plane, ChevronUp } from "lucide-react";
import { PRESSURE_LEVELS } from "@/lib/ecmwfModels";

interface Props {
  open: boolean;
  activeId: string;
  onToggle: () => void;
  onSelect: (id: string) => void;
}

export default function AltitudeSelector({ open, activeId, onToggle, onSelect }: Props) {
  const active = PRESSURE_LEVELS.find((p) => p.id === activeId) ?? PRESSURE_LEVELS[0];

  return (
    <div className="relative pointer-events-auto">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-2 rounded-full bg-gray-900/90 border border-gray-700 backdrop-blur text-xs text-gray-200 hover:bg-gray-800 shadow-lg"
      >
        <Plane className="w-4 h-4 text-blue-400" />
        <span>{active.label}</span>
        <ChevronUp className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[550]" onClick={onToggle} />
          <div className="absolute bottom-full right-0 mb-2 z-[560] bg-gray-900/95 border border-gray-700 rounded-xl shadow-2xl p-2 min-w-[8rem] max-h-64 overflow-y-auto">
            {PRESSURE_LEVELS.map((level) => (
              <button
                key={level.id}
                onClick={() => {
                  onSelect(level.id);
                  onToggle();
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                  level.id === activeId
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                {level.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
