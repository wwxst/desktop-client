import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Sidebar from '../src/renderer/src/components/Sidebar/Sidebar'

describe('Sidebar', () => {
  it('renders the workspace menu in the required order', () => {
    render(<Sidebar activeItem="home" showSmartEdit onItemSelect={vi.fn()} />)

    const navigation = screen.getByRole('navigation', { name: '主菜单' })
    expect(
      within(navigation)
        .getAllByRole('button')
        .filter((button) => button.classList.contains('studio-sidebar__menu-item'))
        .map((button) => button.textContent)
    ).toEqual(['首页', '插件', '媒体库', '智剪', '小说推文', 'TTS 配音'])
  })

  it('renders the account and only shows smart edit when enabled', () => {
    const { rerender } = render(
      <Sidebar activeItem="home" showSmartEdit={false} onItemSelect={vi.fn()} />
    )

    expect(screen.getByRole('navigation', { name: '主菜单' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '首页' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '小说推文' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '插件' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '智剪' })).not.toBeInTheDocument()
    expect(screen.getByText('kasixmb')).toBeInTheDocument()
    expect(screen.getByText('Plus')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument()

    rerender(<Sidebar activeItem="smart-edit" showSmartEdit onItemSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: '智剪' })).toHaveAttribute('aria-current', 'page')
  })

  it('reports the selected menu item', async () => {
    const user = userEvent.setup()
    const onItemSelect = vi.fn()
    render(<Sidebar activeItem="home" showSmartEdit onItemSelect={onItemSelect} />)

    await user.click(screen.getByRole('button', { name: '小说推文' }))
    await user.click(screen.getByRole('button', { name: '插件' }))
    await user.click(screen.getByRole('button', { name: '智剪' }))

    expect(onItemSelect).toHaveBeenNthCalledWith(1, 'novel-promotion')
    expect(onItemSelect).toHaveBeenNthCalledWith(2, 'plugins')
    expect(onItemSelect).toHaveBeenNthCalledWith(3, 'smart-edit')
  })

  it('reports settings selection from the account gear', async () => {
    const user = userEvent.setup()
    const onSettingsSelect = vi.fn()
    render(
      <Sidebar
        activeItem="home"
        showSmartEdit
        onItemSelect={vi.fn()}
        onSettingsSelect={onSettingsSelect}
      />
    )

    await user.click(screen.getByRole('button', { name: '设置' }))

    expect(onSettingsSelect).toHaveBeenCalledTimes(1)
  })
})
