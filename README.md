# Global Weather Watch

Interactive weather radar viewer with global composite imagery, per-station NEXRAD/OPERA products, lightning, and map drawing tools.

## Development

```bash
pnpm install
pnpm dev
```

The app runs at `http://localhost:20405`.

## GitHub Pages

The site is built from `weather-radar/` and deployed with GitHub Actions.

Project layout keeps each top-level folder under GitHub’s 100-file tree limit (`artifacts/` holds mockup and API packages; the radar app lives in `weather-radar/`).

### One-time setup

1. Push this repository to GitHub.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to `main` (or `master`) to trigger a deploy.

### URL

- Project site: `https://<username>.github.io/<repository-name>/`
- User/org site (`<username>.github.io` repo): `https://<username>.github.io/`

The workflow sets `BASE_PATH` automatically from the repository name.

### Local Pages build

```bash
pnpm build:pages
```

Preview the production build:

```bash
pnpm --filter @workspace/weather-radar run serve
```

To test a specific repo path locally:

```bash
# PowerShell
$env:BASE_PATH="/CloudScanWeatherRadar/"; pnpm build:pages

# bash
BASE_PATH=/CloudScanWeatherRadar/ pnpm build:pages
```

## Notes

- Station radar proxies (`/api/meteogate`, `/api/nexrad-l3`, etc.) are dev-only. Production builds call external APIs directly; some sources may block browser requests without CORS headers.
- Drawings and settings are kept in memory for the session only.
