import { CircleCheck, CircleX, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import type { JSX, ReactNode } from 'react'
import { createPortal } from 'react-dom'

import Button from './Button'
import './AlertNotification.css'

export type AlertNotificationVariant = 'info' | 'success' | 'warning' | 'error'

export interface AlertNotificationProps {
  open: boolean
  variant: AlertNotificationVariant
  title?: string
  message: ReactNode
  confirmLabel?: string
  onClose: () => void
}

const variantDetails: Record<
  AlertNotificationVariant,
  { title: string; icon: LucideIcon; role: 'status' | 'alert'; live: 'polite' | 'assertive' }
> = {
  info: { title: '提示', icon: Info, role: 'status', live: 'polite' },
  success: { title: '操作成功', icon: CircleCheck, role: 'status', live: 'polite' },
  warning: { title: '请注意', icon: TriangleAlert, role: 'alert', live: 'assertive' },
  error: { title: '操作失败', icon: CircleX, role: 'alert', live: 'assertive' }
}

function AlertNotification({
  open,
  variant,
  title,
  message,
  confirmLabel = '知道了',
  onClose
}: AlertNotificationProps): JSX.Element | null {
  if (!open) return null

  const details = variantDetails[variant]
  const StatusIcon = details.icon

  return createPortal(
    <div
      className={`ui-alert-notification ui-alert-notification--${variant}`}
      role={details.role}
      aria-live={details.live}
      aria-atomic="true"
    >
      <span className="ui-alert-notification__status-icon" aria-hidden="true">
        <StatusIcon />
      </span>
      <div className="ui-alert-notification__content">
        <div className="ui-alert-notification__title">{title ?? details.title}</div>
        <div className="ui-alert-notification__message">{message}</div>
      </div>
      <button
        className="ui-alert-notification__close"
        type="button"
        aria-label="关闭通知"
        title="关闭通知"
        onClick={onClose}
      >
        <X aria-hidden="true" />
      </button>
      <div className="ui-alert-notification__actions">
        <Button size="sm" onClick={onClose}>
          {confirmLabel}
        </Button>
      </div>
    </div>,
    document.body
  )
}

export default AlertNotification
