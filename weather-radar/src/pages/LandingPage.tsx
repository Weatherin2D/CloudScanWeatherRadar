import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

const FEATURES = [
  {
    name: "Global",
    blurb: "Worldwide composite radar, animated in sync.",
  },
  {
    name: "Station",
    blurb: "NEXRAD and OPERA products with tilt and dual-pol.",
  },
  {
    name: "Alerts",
    blurb: "Severe weather and risk outlooks on the map.",
  },
  {
    name: "Models",
    blurb: "ECMWF fields for the next few days ahead.",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-ink text-foreground overflow-x-hidden">
      {/* ─── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative min-h-[100svh] flex flex-col justify-end">
        <div className="absolute inset-0 overflow-hidden" aria-hidden>
          <img
            src={`${import.meta.env.BASE_URL}hero-radar.jpg`}
            alt=""
            className="cs-hero-media absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/75 to-ink/35" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink/80 via-transparent to-ink/40" />
          {/* Soft radar sweep accent */}
          <div className="pointer-events-none absolute right-[-10%] top-[-10%] h-[70vmin] w-[70vmin] opacity-30">
            <svg viewBox="0 0 200 200" className="h-full w-full cs-sweep-ring">
              <defs>
                <linearGradient id="landingSweep" x1="100" y1="20" x2="180" y2="120">
                  <stop stopColor="#2DD4BF" stopOpacity="0.7" />
                  <stop offset="1" stopColor="#2DD4BF" stopOpacity="0" />
                </linearGradient>
              </defs>
              <circle cx="100" cy="100" r="90" fill="none" stroke="#1A2A3A" strokeWidth="0.8" />
              <circle cx="100" cy="100" r="60" fill="none" stroke="#1A2A3A" strokeWidth="0.6" />
              <path d="M100 100 L100 10 A90 90 0 0 1 175 135 Z" fill="url(#landingSweep)" />
              <circle cx="100" cy="100" r="3" fill="#2DD4BF" />
            </svg>
          </div>
        </div>

        <div className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-16 pt-28 sm:pb-24 sm:pt-32">
          <p className="cs-rise font-display text-5xl font-extrabold tracking-tight text-white sm:text-7xl md:text-8xl">
            CloudScan
          </p>
          <h1 className="cs-rise cs-rise-delay-1 mt-5 max-w-2xl font-display text-2xl font-semibold leading-tight tracking-tight text-white/95 sm:text-3xl md:text-4xl">
            Live weather, from global radar to the next storm day.
          </h1>
          <p className="cs-rise cs-rise-delay-2 mt-4 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
            Station products, lightning, alerts, and models — one dark map built for watching the sky.
          </p>
          <div className="cs-rise cs-rise-delay-3 mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/app"
              className="group inline-flex items-center gap-2 rounded-md bg-radar-cyan px-5 py-3 text-sm font-semibold text-ink transition-transform duration-200 hover:scale-[1.02] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-cyan"
            >
              Open radar
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-5 py-3 text-sm font-medium text-white/85 backdrop-blur-sm transition-colors duration-200 hover:border-white/35 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-cyan"
            >
              See what it does
            </a>
          </div>
        </div>
      </section>

      {/* ─── Features ───────────────────────────────────────────────────── */}
      <section
        id="features"
        className="relative border-t border-ink-border bg-ink-elevated px-6 py-20 sm:py-28"
      >
        <div className="mx-auto max-w-5xl">
          <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            What you can watch
          </h2>
          <p className="mt-3 max-w-lg text-base text-white/60">
            Four modes on one map — switch without leaving the storm.
          </p>
          <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.name} className="border-l-2 border-radar-cyan/50 pl-5">
                <p className="font-display text-xl font-semibold text-white">{f.name}</p>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{f.blurb}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ─── Final CTA ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-ink-border px-6 py-20 sm:py-24">
        <div className="absolute inset-0" aria-hidden>
          <img
            src={`${import.meta.env.BASE_URL}hero-radar-alt.jpg`}
            alt=""
            className="h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-ink/80" />
        </div>
        <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-start gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Open the map.
            </p>
            <p className="mt-2 max-w-md text-sm text-white/55">
              Jump straight into live radar — no account, no setup.
            </p>
          </div>
          <Link
            href="/app"
            className="group inline-flex items-center gap-2 rounded-md bg-radar-cyan px-5 py-3 text-sm font-semibold text-ink transition-transform duration-200 hover:scale-[1.02] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-cyan"
          >
            Launch CloudScan
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-ink-border px-6 py-6 text-center text-xs text-white/35">
        CloudScan
      </footer>
    </div>
  );
}
