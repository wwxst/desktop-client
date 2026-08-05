import { CircleCheck, CircleX, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import Button from './Button'
import './AlertNotification.css'

export type AlertNotificationVariant = 'info' | 'success' | 'warning' | 'error'

export interface AlertNotificationProps {
  open: boolean
  variant: AlertNotificationVariant
  title?: string
  /** Rich display content only. Interactive controls must not be included. */
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

interface NotificationContentProps {
  title: string
  message: ReactNode
  role: 'status' | 'alert'
  live: 'polite' | 'assertive'
}

function NotificationContent({
  title,
  message,
  role,
  live
}: NotificationContentProps): JSX.Element {
  const visualContentRef = useRef<HTMLDivElement>(null)
  const announcedTextRef = useRef('')
  const pendingTextRef = useRef<string | null>(null)
  const clearTimerRef = useRef<number | null>(null)
  const stageTimerRef = useRef<number | null>(null)
  const [announcementText, setAnnouncementText] = useState('')

  useEffect(() => {
    const nextText = visualContentRef.current?.textContent ?? ''
    if (!nextText || nextText === announcedTextRef.current || nextText === pendingTextRef.current) {
      return
    }

    if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current)
    if (stageTimerRef.current !== null) window.clearTimeout(stageTimerRef.current)
    clearTimerRef.current = null
    stageTimerRef.current = null
    pendingTextRef.current = nextText

    const publish = (): void => {
      stageTimerRef.current = null
      pendingTextRef.current = null
      announcedTextRef.current = nextText
      setAnnouncementText(nextText)
    }

    if (announcedTextRef.current) {
      clearTimerRef.current = window.setTimeout(() => {
        clearTimerRef.current = null
        announcedTextRef.current = ''
        setAnnouncementText('')
        stageTimerRef.current = window.setTimeout(publish, 0)
      }, 0)
      return
    }

    stageTimerRef.current = window.setTimeout(publish, 0)
  })

  useEffect(() => {
    return () => {
      if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current)
      if (stageTimerRef.current !== null) window.clearTimeout(stageTimerRef.current)
      clearTimerRef.current = null
      stageTimerRef.current = null
      pendingTextRef.current = null
    }
  }, [])

  return (
    <>
      <div ref={visualContentRef} className="ui-alert-notification__content">
        <div className="ui-alert-notification__title">{title}</div>
        <div className="ui-alert-notification__message">{message}</div>
      </div>
      <div
        className="ui-alert-notification__announcer"
        role={role}
        aria-live={live}
        aria-atomic="true"
      >
        {announcementText}
      </div>
    </>
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
      <NotificationContent
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
