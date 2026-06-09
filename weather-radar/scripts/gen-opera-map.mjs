import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, "../../../node_modules/.pnpm/..."); // fetch from web instead

const csvUrl =
  "https://raw.githubusercontent.com/EUMETNET/openradardata-validator/main/src/openradardata_validator/stations/OPERA_RADARS.csv";

const stationsTs = fs.readFileSync(
  path.join(__dirname, "../src/data/stations.ts"),
  "utf8",
);

const stationRe =
  /\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*lat:\s*([-\d.]+),\s*lon:\s*([-\d.]+),\s*country:\s*"eu"/g;
const euStations = [];
let m;
while ((m = stationRe.exec(stationsTs))) {
  euStations.push({ id: m[1], name: m[2], lat: +m[3], lon: +m[4] });
}

const csv = await fetch(csvUrl).then((r) => r.text());
const lines = csv.trim().split("\n").slice(1);
const opera = lines.map((line) => {
  const cols = line.split(",");
  return {
    odim: cols[6],
    name: cols[7],
    lat: +cols[9],
    lon: +cols[10],
    country: cols[1],
    wigos: cols[5] || null,
  };
});

function dist(a, b) {
  const dlat = a.lat - b.lat;
  const dlon = a.lon - b.lon;
  return Math.sqrt(dlat * dlat + dlon * dlon);
}

const entries = [];
for (const s of euStations) {
  let best = null;
  let bestD = Infinity;
  for (const o of opera) {
    if (!o.odim) continue;
    const d = dist(s, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  if (best && bestD < 0.55) {
    const cc = best.country === "Germany" ? "276" : best.country === "France" ? "250" : "578";
    const locId = best.wigos?.startsWith("0-")
      ? best.wigos
      : `0-${cc}-0-${best.odim}`;
    entries.push({
      stationId: s.id,
      odim: best.odim,
      locationId: locId,
      namingAuthority: best.odim.startsWith("de")
        ? "de.dwd"
        : best.odim.startsWith("fr")
          ? "fr.meteofrance"
          : best.odim.startsWith("nl")
            ? "nl.knmi"
            : best.odim.startsWith("fi")
              ? "fi.fmi"
              : best.odim.startsWith("se")
                ? "se.smhi"
                : best.odim.startsWith("no")
                  ? "no.met"
                  : best.odim.startsWith("dk")
                    ? "dk.dmi"
                    : best.odim.startsWith("be")
                      ? "be.rmi"
                      : best.odim.startsWith("ch")
                        ? "ch.meteoswiss"
                        : best.odim.startsWith("at")
                          ? "at.zamg"
                          : best.odim.startsWith("es")
                            ? "es.aemet"
                            : best.odim.startsWith("it")
                              ? "it.dpc"
                              : best.odim.startsWith("pl")
                                ? "pl.imgw"
                                : best.odim.startsWith("ie")
                                  ? "ie.met"
                                  : "eu.opera",
    });
  } else {
    console.warn("No OPERA match for", s.id, s.name, "bestD", bestD);
  }
}

const out = `/** Auto-generated OPERA station mapping (EU station id → MeteoGate location). */
export interface OperaStationMeta {
  odim: string;
  locationId: string;
  namingAuthority: string;
}

export const OPERA_STATION_MAP: Record<string, OperaStationMeta> = {
${entries
  .map(
    (e) =>
      `  "${e.stationId}": { odim: "${e.odim}", locationId: "${e.locationId}", namingAuthority: "${e.namingAuthority}" },`,
  )
  .join("\n")}
};
`;

fs.writeFileSync(path.join(__dirname, "../src/lib/operaStationMap.ts"), out);
console.log(`Mapped ${entries.length}/${euStations.length} EU stations`);
