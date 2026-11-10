import React from 'react'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative min-h-screen bg-[#050507] text-zinc-100 overflow-x-hidden">
      {/* Subtle cool obsidian top glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 -top-40 h-96 bg-[radial-gradient(ellipse_60%_60%_at_50%_0%,rgba(34,211,238,0.09),rgba(16,185,129,0.05)_45%,transparent_80%)] blur-2xl"
      />
      {/* Subtle masked dot matrix */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-dot-matrix opacity-40"
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}

