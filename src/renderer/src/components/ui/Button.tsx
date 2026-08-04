import { LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react'

import './Button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  loading?: boolean
}

function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...buttonProps
}: ButtonProps): JSX.Element {
  const classes = ['ui-button', `ui-button--${variant}`, `ui-button--${size}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      {...buttonProps}
      className={classes}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      <span className="ui-button__icon" aria-hidden="true">
        {loading ? <LoaderCircle className="ui-button__spinner" /> : icon}
      </span>
      <span className="ui-button__label">{children}</span>
    </button>
  )
}

export default Button
