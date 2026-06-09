import { Buffer } from "buffer";

type NexradParser = (
  file: Buffer,
  options?: { logger?: false | Console },
) => {
  productDescription?: {
    latitude: number;
    longitude: number;
    elevationAngle?: number;
    code?: number;
  };
  radialPackets?: Level3RadialLayer[];
};

let parserPromise: Promise<NexradParser> | null = null;

function loadParser(): Promise<NexradParser> {
  if (!parserPromise) {
    parserPromise = import("@/lib/nexradBrowser/index.js").then((m) => m.default);
  }
  return parserPromise;
}

export interface Level3RadialLayer {
  numberRadials: number;
  numberBins: number;
  rangeScale: number;
  firstBin: number;
  radials: {
    startAngle: number;
    angleDelta: number;
    bins: (number | null)[];
  }[];
  radialsRaw?: {
    startAngle: number;
    angleDelta: number;
    bins: number[];
  }[];
}

export interface Level3Parsed {
  latitude: number;
  longitude: number;
  elevationAngle: number;
  layer: Level3RadialLayer;
}

const DIGITAL_DUAL_POL_CODES = new Set([159, 161, 163]);

/** Mask range bins below the ICD threshold flag (raw values 0–1). */
function maskDigitalDualPol(layer: Level3RadialLayer): void {
  const raw = layer.radialsRaw;
  if (!raw?.length) return;
  for (let r = 0; r < layer.radials.length; r++) {
    const scaled = layer.radials[r]?.bins;
    const rawBins = raw[r]?.bins;
    if (!scaled || !rawBins) continue;
    for (let b = 0; b < rawBins.length; b++) {
      if (rawBins[b] < 2) scaled[b] = null;
    }
  }
}

export async function parseLevel3(buffer: ArrayBuffer): Promise<Level3Parsed | null> {
  const parser = await loadParser();
  const data = parser(Buffer.from(buffer), { logger: false }) as {
    productDescription?: {
      latitude: number;
      longitude: number;
      elevationAngle?: number;
      code?: number;
    };
    radialPackets?: Level3RadialLayer[];
  };

  const layer = data.radialPackets?.[0];
  if (!layer?.radials?.length) return null;

  const productCode = data.productDescription?.code;
  if (productCode != null && DIGITAL_DUAL_POL_CODES.has(productCode)) {
    maskDigitalDualPol(layer);
  }

  return {
    latitude: data.productDescription?.latitude ?? 0,
    longitude: data.productDescription?.longitude ?? 0,
    elevationAngle: data.productDescription?.elevationAngle ?? 0,
    layer,
  };
}
