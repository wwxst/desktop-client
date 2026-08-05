import { CircleCheck, CircleX, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type JSX, type ReactNode } from 'react'
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

interface AnnouncementRegionProps {
  variant: AlertNotificationVariant
  title: string
  message: ReactNode
  role: 'status' | 'alert'
  live: 'polite' | 'assertive'
}

interface StagedAnnouncement {
  variant: AlertNotificationVariant
  title: string
  message: ReactNode
}

function AnnouncementRegion({
  variant,
  title,
  message,
  role,
  live
}: AnnouncementRegionProps): JSX.Element {
  const [announcement, setAnnouncement] = useState<StagedAnnouncement | null>(null)
  const isCurrent =
    announcement?.variant === variant &&
    announcement.title === title &&
    announcement.message === message

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAnnouncement({ variant, title, message })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [message, title, variant])

  return (
    <div className="ui-alert-notification__content" role={role} aria-live={live} aria-atomic="true">
      {isCurrent && (
        <>
          <div className="ui-alert-notification__title">{announcement.title}</div>
          <div className="ui-alert-notification__message">{announcement.message}</div>
        </>
      )}
    </div>
  )
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
    <div className={`ui-alert-notification ui-alert-notification--${variant}`}>
      <span className="ui-alert-notification__status-icon" aria-hidden="true">
        <StatusIcon />
      </span>
      <AnnouncementRegion
        variant={variant}
        title={title ?? details.title}
        message={message}
        role={details.role}
        live={details.live}
      />
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
