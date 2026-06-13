import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function pagesBasePath() {
  if (process.env.BASE_PATH) return process.env.BASE_PATH;
  const repo =
    process.env.GITHUB_REPOSITORY?.split("/")[1] ??
    process.argv[2] ??
    "CloudScanWeatherRadar";
  return repo.endsWith(".github.io") ? "/" : `/${repo}/`;
}

const basePath = pagesBasePath();
const env = { ...process.env, BASE_PATH: basePath };

console.log(`Building for GitHub Pages (BASE_PATH=${basePath})`);

const build = spawnSync(
  "pnpm",
  ["--filter", "@workspace/weather-radar", "run", "build:pages"],
  { cwd: root, stdio: "inherit", shell: true, env },
);

process.exit(build.status ?? 1);
