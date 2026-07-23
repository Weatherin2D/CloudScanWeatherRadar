import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-ink px-6 text-white">
      <p className="font-display text-6xl font-extrabold tracking-tight text-radar-cyan/80">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">
        This page drifted off the radar
      </h1>
      <p className="mt-2 max-w-sm text-center text-sm text-white/55">
        The path you followed isn’t part of CloudScan. Head home or open the live map.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/90 transition-colors hover:border-white/35 hover:bg-white/10"
        >
          Home
        </Link>
        <Link
          href="/app"
          className="group inline-flex items-center gap-2 rounded-md bg-radar-cyan px-4 py-2.5 text-sm font-semibold text-ink transition-transform hover:scale-[1.02] hover:brightness-110"
        >
          Open radar
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
