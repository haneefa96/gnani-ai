import React from 'react'

interface AppHeaderProps {
  title: string
  subtitle?: string
  onBack?: () => void
  backLabel?: string
  rightSlot?: React.ReactNode
}

export function AppHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  rightSlot,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-sm">
      <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 shrink-0"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="w-5 h-5 fill-none stroke-current"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
            </button>
          ) : (
            <div
              aria-hidden="true"
              className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 text-emerald-300 fill-none stroke-current"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight truncate">{title}</h1>
            {subtitle && (
              <p className="text-xs text-indigo-200 truncate">{subtitle}</p>
            )}
          </div>
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>
    </header>
  )
}

