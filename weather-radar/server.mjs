import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist", "public");

const rawPort = process.env.PORT ?? "5000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/** Mirrors the Vite dev-server proxy table in vite.config.ts. */
const apiProxies = [
  {
    mount: "/api/nexrad-l3",
    target: "https://unidata-nexrad-level3.s3.amazonaws.com",
    rewrite: /^\/api\/nexrad-l3/,
  },
  {
    mount: "/api/meteogate",
    target: "https://api.meteogate.eu",
    rewrite: /^\/api\/meteogate/,
  },
  {
    mount: "/api/openradar",
    target: "https://s3.waw3-1.cloudferro.com",
    rewrite: /^\/api\/openradar/,
  },
  {
    mount: "/api/ifrc-alerts",
    target: "https://alerthub-api.ifrc.org",
    rewrite: /^\/api\/ifrc-alerts/,
    replacement: "/graphql",
  },
  {
    mount: "/api/mesocast",
    target: "https://mesocast.uk",
    rewrite: /^\/api\/mesocast/,
  },
  {
    mount: "/api/open-meteo",
    target: "https://api.open-meteo.com",
    rewrite: /^\/api\/open-meteo/,
  },
  {
    mount: "/api/stormforecast",
    target: "https://stormforecast.eu",
    rewrite: /^\/api\/stormforecast/,
  },
];

const app = express();

for (const proxy of apiProxies) {
  app.use(
    proxy.mount,
    createProxyMiddleware({
      target: proxy.target,
      changeOrigin: true,
      pathRewrite: (requestPath) =>
        requestPath.replace(
          proxy.rewrite,
          proxy.replacement ?? "",
        ),
    }),
  );
}

app.use(express.static(distDir, { index: false }));

app.use((req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`CloudScan server listening on http://0.0.0.0:${port}`);
});
