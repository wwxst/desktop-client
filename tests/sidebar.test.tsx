import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Sidebar from '../src/renderer/src/components/Sidebar/Sidebar'

describe('Sidebar', () => {
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
})
