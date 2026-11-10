import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-150 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed'

  const variantStyles: Record<string, string> = {
    primary: 'bg-indigo-700 text-white hover:bg-indigo-800 focus:ring-indigo-500 shadow-sm',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-slate-400 shadow-sm',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500 shadow-sm',
  }

  const sizeStyles: Record<string, string> = {
    sm: 'px-3.5 py-2 text-sm',
    md: 'px-4 py-2.5 text-sm sm:text-base',
    lg: 'px-6 py-3 text-base sm:text-lg',
  }

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export default Button
