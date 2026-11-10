import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center gap-2 font-semibold rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#09090B] transition-all duration-150 active:scale-[0.985] disabled:opacity-45 disabled:cursor-not-allowed";

  const variantStyles: Record<string, string> = {
    primary:
      "bg-gradient-to-r from-cyan-400 to-emerald-400 text-zinc-950 hover:from-cyan-300 hover:to-emerald-300 focus:ring-cyan-400/60 shadow-[0_0_24px_-6px_rgba(34,211,238,0.45)]",
    secondary:
      "bg-zinc-900/90 text-zinc-100 border border-zinc-700/80 hover:bg-zinc-800 hover:border-zinc-600 focus:ring-zinc-500/50",
    danger:
      "bg-rose-500/15 text-rose-300 border border-rose-500/35 hover:bg-rose-500/25 hover:text-rose-200 focus:ring-rose-500/50",
  };

  const sizeStyles: Record<string, string> = {
    sm: "px-3.5 py-2 text-xs sm:text-sm",
    md: "px-4 py-2.5 text-sm sm:text-base",
    lg: "px-6 py-3 text-base sm:text-lg",
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
