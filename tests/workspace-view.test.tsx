import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import WorkspaceView from '../src/renderer/src/components/Workspace/WorkspaceView'

describe('WorkspaceView', () => {
  it('opens smart edit, creates a draft, and returns to the draft list', async () => {
    const user = userEvent.setup()
    render(<WorkspaceView />)

    expect(screen.getByRole('button', { name: '首页' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('button', { name: '智剪' }))
    expect(screen.getByRole('region', { name: '智剪草稿' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新建草稿' }))
    expect(screen.getByRole('region', { name: '智剪编辑器' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '返回草稿' }))
    expect(screen.getByRole('region', { name: '智剪草稿' })).toBeInTheDocument()
  })

  it('resets an editor session after selecting another menu', async () => {
    const user = userEvent.setup()
    render(<WorkspaceView />)

    await user.click(screen.getByRole('button', { name: '智剪' }))
    await user.click(screen.getByRole('button', { name: '新建草稿' }))
    await user.click(screen.getByRole('button', { name: '小说推文' }))
    expect(screen.getByRole('button', { name: '小说推文' })).toHaveAttribute(
      'aria-current',
      'page'
    )

    await user.click(screen.getByRole('button', { name: '智剪' }))
    expect(screen.getByRole('region', { name: '智剪草稿' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '智剪编辑器' })).not.toBeInTheDocument()
  })
})
