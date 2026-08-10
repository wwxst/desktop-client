import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AiPanel from '../src/renderer/src/components/AiPanel/AiPanel'

describe('AiPanel', () => {
  it('renders the chat shell and switches to Codex mode', async () => {
    const user = userEvent.setup()
    render(<AiPanel />)

    expect(screen.getByRole('region', { name: 'AI 助手' })).toBeInTheDocument()
    expect(screen.getByText('使用智能体构建')).toBeInTheDocument()
    expect(screen.getByText('桌面端自动剪辑产品PRD.md')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()

    await user.click(screen.getByRole('tab', { name: 'CODEX' }))

    expect(screen.getByRole('tab', { name: 'CODEX' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('使用 Codex 协助构建')).toBeInTheDocument()
  })

  it('adds submitted prompts to the active conversation', async () => {
    const user = userEvent.setup()
    render(<AiPanel />)

    const composer = screen.getByRole('textbox', { name: '描述要构建的内容' })
    await user.type(composer, '把当前素材整理成三段式短视频')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(screen.getByRole('log', { name: '当前会话' })).toHaveTextContent(
      '把当前素材整理成三段式短视频'
    )
    expect(composer).toHaveValue('')
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
  })

  it('opens settings and can remove the automatic project context', async () => {
    const user = userEvent.setup()
    render(<AiPanel />)

    await user.click(screen.getByRole('button', { name: 'AI 面板设置' }))
    const autoAttach = screen.getByRole('checkbox', { name: '自动附加当前项目' })
    expect(autoAttach).toBeChecked()

    await user.click(autoAttach)

    expect(screen.queryByText('桌面端自动剪辑产品PRD.md')).not.toBeInTheDocument()
  })

  it('collapses and restores the right panel', async () => {
    const user = userEvent.setup()
    const onCollapse = vi.fn()
    const onExpand = vi.fn()
    render(<AiPanel onCollapse={onCollapse} onExpand={onExpand} />)

    await user.click(screen.getByRole('button', { name: '关闭 AI 面板' }))
    expect(onCollapse).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: '打开 AI 面板' }))
    expect(onExpand).toHaveBeenCalledOnce()
    expect(screen.getByRole('tab', { name: '聊天' })).toBeInTheDocument()
  })
})
