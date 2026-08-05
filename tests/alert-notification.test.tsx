import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AlertNotification, {
  type AlertNotificationVariant
} from '../src/renderer/src/components/ui/AlertNotification'

interface VariantCase {
  variant: AlertNotificationVariant
  title: string
  role: 'status' | 'alert'
  live: 'polite' | 'assertive'
  iconClass: string
}

const variantCases: VariantCase[] = [
  {
    variant: 'info',
    title: '提示',
    role: 'status',
    live: 'polite',
    iconClass: 'lucide-info'
  },
  {
    variant: 'success',
    title: '操作成功',
    role: 'status',
    live: 'polite',
    iconClass: 'lucide-circle-check'
  },
  {
    variant: 'warning',
    title: '请注意',
    role: 'alert',
    live: 'assertive',
    iconClass: 'lucide-triangle-alert'
  },
  {
    variant: 'error',
    title: '操作失败',
    role: 'alert',
    live: 'assertive',
    iconClass: 'lucide-circle-x'
  }
]

afterEach(() => vi.useRealTimers())

function renderAlert(
  overrides: {
    open?: boolean
    variant?: AlertNotificationVariant
    title?: string
    message?: ReactNode
    confirmLabel?: string
    onClose?: () => void
  } = {}
): RenderResult {
  return render(
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

function readAlertCss(): string {
  const cssUrl = new URL('../src/renderer/src/components/ui/AlertNotification.css', import.meta.url)
  return readFileSync(
    cssUrl.protocol === 'file:' ? cssUrl : resolve(process.cwd(), cssUrl.pathname.slice(1)),
    'utf8'
  )
}

function getCssBlock(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1]
  expect(block, `Missing CSS block for ${selector}`).toBeDefined()
  return block ?? ''
}

function getVisualContent(): HTMLElement {
  const content = document.querySelector<HTMLElement>('.ui-alert-notification__content')
  expect(content).toBeInTheDocument()
  return content as HTMLElement
}

describe('AlertNotification', () => {
  it.each(variantCases)(
    'renders the $variant variant with its default title, icon, and live-region semantics',
    async ({ variant, title, role, live, iconClass }) => {
      renderAlert({ variant })

      const liveRegion = screen.getByRole(role)
      const notification = liveRegion.closest('.ui-alert-notification')
      expect(notification).toHaveClass('ui-alert-notification', `ui-alert-notification--${variant}`)
      expect(liveRegion).toHaveAttribute('aria-live', live)
      expect(liveRegion).toHaveAttribute('aria-atomic', 'true')
      expect(within(getVisualContent()).getByText(title)).toHaveClass(
        'ui-alert-notification__title'
      )
      await waitFor(() => expect(liveRegion.textContent).toBe(getVisualContent().textContent))

      const icon = notification?.querySelector('.ui-alert-notification__status-icon')
      expect(icon).toHaveAttribute('aria-hidden', 'true')
      expect(icon?.querySelector(`svg.${iconClass}`)).toBeInTheDocument()
    }
  )

  it('portals the notification directly under document.body', () => {
    const container = document.createElement('div')
    document.body.append(container)

    render(<AlertNotification open variant="info" message="Portal 通知" onClose={vi.fn()} />, {
      container
    })

    expect(container).toBeEmptyDOMElement()
    expect(document.body.querySelector(':scope > .ui-alert-notification')).toBeInTheDocument()
  })

  it('adds and removes the portal across its controlled lifecycle', async () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <AlertNotification open={false} variant="info" message="生命周期通知" onClose={onClose} />
    )

    expect(document.querySelector('.ui-alert-notification')).not.toBeInTheDocument()

    rerender(<AlertNotification open variant="info" message="生命周期通知" onClose={onClose} />)
    expect(await screen.findByText('生命周期通知')).toBeInTheDocument()

    rerender(
      <AlertNotification open={false} variant="info" message="生命周期通知" onClose={onClose} />
    )
    expect(document.querySelector('.ui-alert-notification')).not.toBeInTheDocument()
  })

  it('mounts an empty noninteractive live region before announcing content', async () => {
    renderAlert({ message: '延迟播报内容' })

    const liveRegion = screen.getByRole('status')
    expect(liveRegion).toBeEmptyDOMElement()
    expect(within(liveRegion).queryAllByRole('button')).toHaveLength(0)
    expect(within(getVisualContent()).getByText('延迟播报内容')).toBeInTheDocument()

    await waitFor(() => expect(liveRegion.textContent).toBe(getVisualContent().textContent))
    expect(within(liveRegion).queryAllByRole('button')).toHaveLength(0)
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('keeps visual rich content stable and does not reannounce equivalent JSX', async () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <AlertNotification
        open
        variant="info"
        message={<strong>等价富内容</strong>}
        onClose={onClose}
      />
    )
    const liveRegion = screen.getByRole('status')
    const visualContent = getVisualContent()
    expect(within(visualContent).getByText('等价富内容').tagName).toBe('STRONG')
    await waitFor(() => expect(liveRegion.textContent).toBe(visualContent.textContent))
    const announcedText = liveRegion.textContent

    rerender(
      <AlertNotification
        open
        variant="info"
        message={<strong>等价富内容</strong>}
        onClose={onClose}
      />
    )

    expect(within(visualContent).getByText('等价富内容').tagName).toBe('STRONG')
    expect(liveRegion.textContent).toBe(announcedText)
    await new Promise((resolveTimer) => window.setTimeout(resolveTimer, 10))
    expect(within(visualContent).getByText('等价富内容')).toBeInTheDocument()
    expect(liveRegion.textContent).toBe(announcedText)
  })

  it('updates visual rich content immediately and stages changed plain text', async () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <AlertNotification
        open
        variant="info"
        message={<strong>旧富内容</strong>}
        onClose={onClose}
      />
    )
    const liveRegion = screen.getByRole('status')
    const visualContent = getVisualContent()
    await waitFor(() => expect(liveRegion.textContent).toBe(visualContent.textContent))
    const previousAnnouncement = liveRegion.textContent

    rerender(
      <AlertNotification open variant="info" message={<em>新富内容</em>} onClose={onClose} />
    )

    expect(within(visualContent).getByText('新富内容').tagName).toBe('EM')
    expect(within(visualContent).queryByText('旧富内容')).not.toBeInTheDocument()
    expect(liveRegion.textContent).toBe(previousAnnouncement)
    await waitFor(() => expect(liveRegion.textContent).toBe(visualContent.textContent))
    expect(liveRegion).toHaveTextContent('新富内容')
    expect(liveRegion.querySelector('*')).not.toBeInTheDocument()
  })

  it('restages identical text when live-region severity changes', async () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <AlertNotification
        open
        variant="info"
        title="固定标题"
        message={<strong>固定内容</strong>}
        onClose={onClose}
      />
    )
    const visualContent = getVisualContent()
    const politeStatus = screen.getByRole('status')
    await waitFor(() => expect(politeStatus.textContent).toBe(visualContent.textContent))

    rerender(
      <AlertNotification
        open
        variant="error"
        title="固定标题"
        message={<strong>固定内容</strong>}
        onClose={onClose}
      />
    )

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    const assertiveAlert = screen.getByRole('alert')
    expect(assertiveAlert).toHaveAttribute('aria-live', 'assertive')
    expect(assertiveAlert).toBeEmptyDOMElement()
    expect(within(visualContent).getByText('固定标题')).toBeInTheDocument()
    expect(within(visualContent).getByText('固定内容').tagName).toBe('STRONG')

    await waitFor(() => expect(assertiveAlert.textContent).toBe(visualContent.textContent))
  })

  it('cancels pending announcement timers on replacement and close', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const { rerender } = render(
      <AlertNotification open variant="info" message="过期播报" onClose={onClose} />
    )

    rerender(<AlertNotification open variant="info" message="最新播报" onClose={onClose} />)
    const liveRegion = screen.getByRole('status')
    expect(liveRegion).toBeEmptyDOMElement()

    act(() => vi.runAllTimers())
    expect(liveRegion).toHaveTextContent('最新播报')
    expect(liveRegion).not.toHaveTextContent('过期播报')

    rerender(<AlertNotification open variant="info" message="关闭前播报" onClose={onClose} />)
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    rerender(
      <AlertNotification open={false} variant="info" message="关闭前播报" onClose={onClose} />
    )
    expect(vi.getTimerCount()).toBe(0)

    act(() => vi.runAllTimers())
    expect(document.querySelector('.ui-alert-notification')).not.toBeInTheDocument()
  })

  it('renders custom title, message, and confirmation label', async () => {
    renderAlert({
      title: '自定义标题',
      message: <strong>自定义内容</strong>,
      confirmLabel: '确认'
    })

    expect(within(getVisualContent()).getByText('自定义标题')).toBeInTheDocument()
    expect(within(getVisualContent()).getByText('自定义内容').tagName).toBe('STRONG')
    expect(screen.getByRole('button', { name: '确认' })).toHaveClass('ui-button--sm')
  })

  it('calls onClose from the top-right close command', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderAlert({ onClose })

    const closeButton = screen.getByRole('button', { name: '关闭通知' })
    expect(closeButton).toHaveAttribute('title', '关闭通知')
    await user.click(closeButton)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose from the confirmation command', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderAlert({ onClose })

    await user.click(screen.getByRole('button', { name: '知道了' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when closed', () => {
    renderAlert({ open: false })

    expect(document.querySelector('.ui-alert-notification')).not.toBeInTheDocument()
  })

  it('keeps the root notification positioning, surface, and viewport bounds contract', () => {
    const rootBlock = getCssBlock(readAlertCss(), '.ui-alert-notification')

    expect(rootBlock).toMatch(/position:\s*fixed/)
    expect(rootBlock).toMatch(/right:\s*18px/)
    expect(rootBlock).toMatch(/bottom:\s*18px/)
    expect(rootBlock).toMatch(/max-height:\s*calc\(100vh\s*-\s*36px\)/)
    expect(rootBlock).toMatch(/overflow:\s*hidden/)
    expect(rootBlock).toMatch(/background:\s*#ffffff/)
    expect(rootBlock).toMatch(/border-radius:\s*0/)
  })

  it('constrains long and rich announcement content within a scrollable region', () => {
    const css = readAlertCss()
    const contentBlock = getCssBlock(css, '.ui-alert-notification__content')
    const titleBlock = getCssBlock(css, '.ui-alert-notification__title')
    const messageBlock = getCssBlock(css, '.ui-alert-notification__message')
    const messageChildrenBlock = getCssBlock(css, '.ui-alert-notification__message > *')

    expect(contentBlock).toMatch(/min-height:\s*0/)
    expect(contentBlock).toMatch(/overflow:\s*auto/)
    expect(titleBlock).toMatch(/overflow-wrap:\s*anywhere/)
    expect(messageBlock).toMatch(/max-width:\s*100%/)
    expect(messageBlock).toMatch(/overflow-wrap:\s*anywhere/)
    expect(messageChildrenBlock).toMatch(/max-width:\s*100%/)
  })

  it('constrains and ellipsizes long confirmation labels', () => {
    const css = readAlertCss()
    const actionsBlock = getCssBlock(css, '.ui-alert-notification__actions')
    const buttonBlock = getCssBlock(css, '.ui-alert-notification__actions .ui-button')
    const labelBlock = getCssBlock(css, '.ui-alert-notification__actions .ui-button__label')

    expect(actionsBlock).toMatch(/min-width:\s*0/)
    expect(actionsBlock).toMatch(/overflow:\s*hidden/)
    expect(buttonBlock).toMatch(/max-width:\s*100%/)
    expect(labelBlock).toMatch(/overflow:\s*hidden/)
    expect(labelBlock).toMatch(/text-overflow:\s*ellipsis/)
    expect(labelBlock).toMatch(/white-space:\s*nowrap/)
  })
})
