import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import AlertNotification, {
  type AlertNotificationVariant
} from '../src/renderer/src/components/ui/AlertNotification'

interface VariantCase {
  variant: AlertNotificationVariant
  title: string
  role: 'status' | 'alert'
  live: 'polite' | 'assertive'
}

const variantCases: VariantCase[] = [
  { variant: 'info', title: '提示', role: 'status', live: 'polite' },
  { variant: 'success', title: '操作成功', role: 'status', live: 'polite' },
  { variant: 'warning', title: '请注意', role: 'alert', live: 'assertive' },
  { variant: 'error', title: '操作失败', role: 'alert', live: 'assertive' }
]

function renderAlert(
  overrides: {
    open?: boolean
    variant?: AlertNotificationVariant
    title?: string
    message?: ReactNode
    confirmLabel?: string
    onClose?: () => void
  } = {}
): void {
  render(
    <AlertNotification
      open={overrides.open ?? true}
      variant={overrides.variant ?? 'info'}
      title={overrides.title}
      message={overrides.message ?? '通知内容'}
      confirmLabel={overrides.confirmLabel}
      onClose={overrides.onClose ?? vi.fn()}
    />
  )
}

describe('AlertNotification', () => {
  it.each(variantCases)(
    'renders the $variant variant with its default title and live-region semantics',
    ({ variant, title, role, live }) => {
      renderAlert({ variant })

      const notification = screen.getByRole(role)
      expect(notification).toHaveClass('ui-alert-notification', `ui-alert-notification--${variant}`)
      expect(notification).toHaveAttribute('aria-live', live)
      expect(notification).toHaveAttribute('aria-atomic', 'true')
      expect(screen.getByText(title)).toHaveClass('ui-alert-notification__title')

      const icon = notification.querySelector('.ui-alert-notification__status-icon')
      expect(icon).toHaveAttribute('aria-hidden', 'true')
      expect(icon?.querySelector('svg')).toBeInTheDocument()
    }
  )

  it('renders custom title, message, and confirmation label', () => {
    renderAlert({
      title: '自定义标题',
      message: <strong>自定义内容</strong>,
      confirmLabel: '确认'
    })

    expect(screen.getByText('自定义标题')).toBeInTheDocument()
    expect(screen.getByText('自定义内容').tagName).toBe('STRONG')
    expect(screen.getByRole('button', { name: '确认' })).toHaveClass('ui-button--sm')
  })

  it('calls onClose from the top-right close command', () => {
    const onClose = vi.fn()
    renderAlert({ onClose })

    const closeButton = screen.getByRole('button', { name: '关闭通知' })
    expect(closeButton).toHaveAttribute('title', '关闭通知')
    fireEvent.click(closeButton)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose from the confirmation command', () => {
    const onClose = vi.fn()
    renderAlert({ onClose })

    fireEvent.click(screen.getByRole('button', { name: '知道了' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when closed', () => {
    renderAlert({ open: false })

    expect(document.querySelector('.ui-alert-notification')).not.toBeInTheDocument()
  })

  it('keeps the root notification positioning and surface contract', () => {
    const cssUrl = new URL(
      '../src/renderer/src/components/ui/AlertNotification.css',
      import.meta.url
    )
    const css = readFileSync(
      cssUrl.protocol === 'file:' ? cssUrl : resolve(process.cwd(), cssUrl.pathname.slice(1)),
      'utf8'
    )
    const rootBlock = css.match(/\.ui-alert-notification\s*\{([^}]*)\}/)?.[1]

    expect(rootBlock).toBeDefined()
    expect(rootBlock).toMatch(/position:\s*fixed/)
    expect(rootBlock).toMatch(/right:\s*18px/)
    expect(rootBlock).toMatch(/bottom:\s*18px/)
    expect(rootBlock).toMatch(/background:\s*#ffffff/)
    expect(rootBlock).toMatch(/border-radius:\s*0/)
  })
})
