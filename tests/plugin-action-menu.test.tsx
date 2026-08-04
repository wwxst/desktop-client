import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import PluginActionMenu from '../src/renderer/src/components/Plugins/PluginActionMenu'

describe('PluginActionMenu', () => {
  it('opens the gear menu and invokes unload', async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()

    render(<PluginActionMenu label="本地 TTS 配音" disabled={false} onRemove={onRemove} />)

    await user.click(screen.getByRole('button', { name: '管理本地 TTS 配音' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: '卸载' }))
    expect(onRemove).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the menu when Escape is pressed', async () => {
    const user = userEvent.setup()

    render(<PluginActionMenu label="中文高品质音色" disabled={false} onRemove={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: '管理中文高品质音色' })
    await user.click(trigger)
    await user.tab()
    expect(screen.getByRole('menuitem', { name: '卸载' })).toHaveFocus()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
