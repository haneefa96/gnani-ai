import React from 'react'

interface AuthBackdropProps {
  children: React.ReactNode
}

export function AuthBackdrop({ children }: AuthBackdropProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex flex-col items-center justify-center p-4 sm:p-6">
      {/* Subtle architectural grid & ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-80"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 -left-24 h-80 w-80 rounded-full bg-indigo-500/25 blur-3xl animate-float-slow"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 -right-24 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl animate-float-slow-reverse"
      />

      {/* Brand pill */}
      <div className="relative z-10 mb-5 flex items-center gap-2.5 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-medium text-indigo-100 backdrop-blur-md">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
        <span>Saakshi · Voice-First Wage Ledger</span>
      </div>

      {/* Main glass card container */}
      <div className="relative z-10 w-full max-w-md animate-fade-up">
        {children}
      </div>

      {/* Reassuring footer badges */}
      <div
        aria-hidden="true"
        className="relative z-10 mt-6 flex flex-wrap items-center justify-center gap-4 text-[11px] font-medium text-indigo-200/75"
      >
        <span className="flex items-center gap-1.5">
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 text-emerald-400 fill-none stroke-current"
            strokeWidth={2}
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          </svg>
          4 Indian Languages
        </span>
        <span className="text-white/20">•</span>
        <span className="flex items-center gap-1.5">
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 text-emerald-400 fill-none stroke-current"
            strokeWidth={2}
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          Tamper-Evident Records
        </span>
      </div>
    </div>
  )
}

