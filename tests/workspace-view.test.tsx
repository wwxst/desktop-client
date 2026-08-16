import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import WorkspaceView from '../src/renderer/src/components/Workspace/WorkspaceView'

function mockModelApi(): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      listAgentModelCatalog: vi.fn().mockResolvedValue({
        success: true,
        message: '模型目录加载成功',
        source: 'remote',
        catalog: { providers: [] }
      }),
      listAgentModelConfigurations: vi.fn().mockResolvedValue({
        success: true,
        message: '模型配置加载成功',
        configurations: []
      }),
      createAgentModelConfiguration: vi.fn(),
      updateAgentModelConfiguration: vi.fn(),
      deleteAgentModelConfiguration: vi.fn()
    }
  })
}

describe('WorkspaceView', () => {
  it('opens the editing Agent workspace without exposing the retired smart edit page', () => {
    render(<WorkspaceView />)

    expect(screen.getByRole('button', { name: '新任务' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('region', { name: '剪辑 Agent 工作台' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '想让 Agent 为你剪什么？' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '智剪' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '智剪编辑器' })).not.toBeInTheDocument()
  })

  it('starts a fresh Agent task from the sidebar', async () => {
    const user = userEvent.setup()
    render(<WorkspaceView />)

    await user.click(screen.getByRole('button', { name: '整理批量生产流程' }))
    expect(screen.getByRole('textbox', { name: '描述剪辑任务' })).not.toHaveValue('')

    await user.click(screen.getByRole('button', { name: '新任务' }))

    expect(screen.getByRole('textbox', { name: '描述剪辑任务' })).toHaveValue('')
    expect(screen.getByRole('heading', { name: '想让 Agent 为你剪什么？' })).toBeInTheDocument()
  })

  it('opens the novel promotion workflow as the production editing entry point', async () => {
    const user = userEvent.setup()
    render(<WorkspaceView />)

    await user.click(screen.getByRole('button', { name: '小说推文' }))

    expect(screen.getByRole('button', { name: '小说推文' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('region', { name: '小说推文批量生成' })).toBeInTheDocument()
  })

  it('opens the shared model settings from the account menu', async () => {
    mockModelApi()
    const user = userEvent.setup()
    render(<WorkspaceView />)

    await user.click(screen.getByRole('button', { name: '设置' }))

    expect(screen.getByRole('region', { name: '设置' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'AI 模型' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '智剪' })).not.toBeInTheDocument()
  })
})
