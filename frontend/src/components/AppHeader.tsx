import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  showNav?: boolean;
  rightSlot?: React.ReactNode;
}

const NAV_ITEMS = [
  { path: "/home", label: "Home" },
  { path: "/history", label: "History" },
  { path: "/export", label: "Export" },
] as const;

export function AppHeader({
  title,
  subtitle,
  onBack,
  backLabel = "Back",
  showNav = false,
  rightSlot,
}: AppHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="sticky top-0 z-20 bg-[#07070A]/85 backdrop-blur-xl border-b border-white/[0.08] text-zinc-100">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 shrink-0"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="w-4 h-4 fill-none stroke-current"
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
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-400 text-zinc-950 font-extrabold text-sm flex items-center justify-center shrink-0"
            >
              S
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-white truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs text-zinc-400 truncate">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {showNav && (
            <nav
              aria-label="Primary"
              className="hidden sm:flex items-center gap-1 rounded-xl bg-zinc-900/90 border border-zinc-800 p-1"
            >
              {NAV_ITEMS.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => navigate(item.path)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      active
                        ? "bg-gradient-to-r from-cyan-400 to-emerald-400 text-zinc-950 shadow-sm"
                        : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          )}
          {rightSlot}
        </div>
      </div>

      {showNav && (
        <nav
          aria-label="Mobile Navigation"
          className="sm:hidden border-t border-white/[0.06] px-4 py-1.5 flex items-center gap-1.5"
        >
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center transition-all ${
                  active
                    ? "bg-gradient-to-r from-cyan-400 to-emerald-400 text-zinc-950 shadow-sm"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      )}
    </header>
  );
}
