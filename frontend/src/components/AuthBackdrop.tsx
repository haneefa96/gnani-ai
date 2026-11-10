import React from "react";

interface AuthBackdropProps {
  children: React.ReactNode;
}

export function AuthBackdrop({ children }: AuthBackdropProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050507] text-zinc-100 flex flex-col items-center justify-center p-4 sm:p-6">
      {/* 1. Cool cyan + emerald radial overhead beam */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-44 left-1/2 h-[540px] w-[960px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.16)_0%,rgba(16,185,129,0.11)_36%,rgba(5,5,7,0)_72%)] blur-3xl animate-beam-drift"
      />

      {/* 2. Side ambient rim lighting (cyan left / emerald bottom-right) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/3 -left-36 h-80 w-80 rounded-full bg-cyan-500/10 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-emerald-500/10 blur-[130px]"
      />

      {/* 3. Masked dot-matrix precision pattern */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-dot-matrix opacity-70"
      />

      {/* 4. Iconic Concentric Vault Rings + Horizon Soundwave SVG */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1200 720"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-40"
      >
        <defs>
          <linearGradient
            id="saakshi-wave-grad"
            x1="0%"
            y1="50%"
            x2="100%"
            y2="50%"
          >
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
            <stop offset="30%" stopColor="#22d3ee" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#34d399" stopOpacity="0.7" />
            <stop offset="70%" stopColor="#22d3ee" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="saakshi-ring-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.02" />
          </radialGradient>
        </defs>

        {/* Concentric cryptographic seal rings */}
        <circle
          cx="600"
          cy="360"
          r="210"
          fill="none"
          stroke="url(#saakshi-ring-grad)"
          strokeWidth="1"
          strokeDasharray="4 8"
        />
        <circle
          cx="600"
          cy="360"
          r="320"
          fill="none"
          stroke="rgba(34,211,238,0.12)"
          strokeWidth="1"
        />
        <circle
          cx="600"
          cy="360"
          r="440"
          fill="none"
          stroke="rgba(16,185,129,0.08)"
          strokeWidth="1"
          strokeDasharray="2 10"
        />

        {/* Iconic horizontal acoustic signature waveform */}
        <path
          d="M 0 360 Q 150 360 220 360 T 330 330 T 410 392 T 475 300 T 535 415 T 600 285 T 665 415 T 725 305 T 790 388 T 870 335 T 980 360 L 1200 360"
          fill="none"
          stroke="url(#saakshi-wave-grad)"
          strokeWidth="1.5"
        />
      </svg>

      {/* 5. Subtle SVG film-grain noise texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
      >
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <filter id="saakshi-noise">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.82"
              numOctaves="3"
              stitchTiles="stitch"
            />
          </filter>
          <rect width="100%" height="100%" filter="url(#saakshi-noise)" />
        </svg>
      </div>

      {/* Main dark obsidian glass card container */}
      <div className="relative z-10 w-full max-w-md animate-fade-up">
        {children}
      </div>
    </div>
  );
}
