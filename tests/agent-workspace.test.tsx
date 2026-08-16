import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CodexEvent } from '../src/shared/codex'
import AgentWorkspace from '../src/renderer/src/components/AgentWorkspace/AgentWorkspace'
import { LAST_USED_AGENT_MODEL_CONFIG_KEY } from '../src/renderer/src/components/AgentWorkspace/agentWorkspaceModelPreference'
import { AGENT_PERMISSION_MODE_KEY } from '../src/renderer/src/components/AgentWorkspace/agentWorkspacePermissionPreference'

interface MockAgentApiOptions {
  models?: Array<{
    id: string
    model: string
    displayName: string
    description: string
    isDefault: boolean
  }>
  assistantChunks?: string[]
  connected?: boolean
}

interface MockAgentApiFixture {
  emit: (event: CodexEvent) => void
  interruptCodexTurn: ReturnType<typeof vi.fn>
  respondCodexApproval: ReturnType<typeof vi.fn>
  startCodexThread: ReturnType<typeof vi.fn>
  startCodexTurn: ReturnType<typeof vi.fn>
}

function mockAgentApi({
  models = [
    {
      id: 'gpt-video',
      model: 'gpt-video',
      displayName: 'GPT Video',
      description: 'Video Agent',
      isDefault: true
    }
  ],
  assistantChunks = ['我会先整理素材', '和剪辑目标。'],
  connected = true
}: MockAgentApiOptions = {}): MockAgentApiFixture {
  const listeners = new Set<(event: CodexEvent) => void>()
  let turnIndex = 0
  const emit = (event: CodexEvent): void => {
    for (const listener of listeners) listener(event)
  }
  const startCodexThread = vi.fn().mockResolvedValue({
    success: true,
    message: 'Codex 对话已创建',
    thread: {
      id: 'thread-1',
      preview: '',
      name: null,
      modelProvider: 'openai',
      createdAt: 1,
      updatedAt: 1
    }
  })
  const startCodexTurn = vi.fn().mockImplementation(async () => {
    turnIndex += 1
    const turnId = `turn-${turnIndex}`
    queueMicrotask(() => {
      emit({ type: 'turn-started', threadId: 'thread-1', turnId })
      for (const [index, delta] of assistantChunks.entries()) {
        emit({
          type: 'message-delta',
          threadId: 'thread-1',
          turnId,
          itemId: `item-${turnIndex}-${index}`,
          delta
        })
      }
      emit({ type: 'turn-completed', threadId: 'thread-1', turnId, status: 'completed' })
    })
    return { success: true, message: 'Codex Turn 已开始', threadId: 'thread-1', turnId }
  })
  const respondCodexApproval = vi.fn().mockResolvedValue({ success: true, message: '已处理' })
  const interruptCodexTurn = vi.fn().mockResolvedValue({ success: true, message: '已取消' })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      getCodexStatus: vi.fn().mockResolvedValue({
        success: connected,
        connected,
        message: connected ? 'Codex App Server 已连接' : 'Codex 不可用'
      }),
      listCodexModels: vi.fn().mockResolvedValue({
        success: true,
        message: 'Codex 模型加载成功',
        models
      }),
      startCodexThread,
      startCodexTurn,
      interruptCodexTurn,
      respondCodexApproval,
      onCodexEvent: vi.fn((listener: (event: CodexEvent) => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      })
    }
  })
  return { emit, interruptCodexTurn, respondCodexApproval, startCodexThread, startCodexTurn }
}

afterEach(() => {
  window.localStorage.clear()
})

describe('AgentWorkspace', () => {
  it('renders the video editing Agent welcome state and Codex model', async () => {
    mockAgentApi()
    render(<AgentWorkspace />)

    expect(screen.getByRole('heading', { name: '想让 Agent 为你剪什么？' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '分析这批视频素材' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '规划小说推文短视频' })).toBeInTheDocument()
    expect(screen.getByLabelText('当前上下文')).toHaveTextContent('未选择项目')
    expect(screen.getByLabelText('当前上下文')).toHaveTextContent('剪映 5.9')
    expect(screen.getByText('请求批准')).toBeInTheDocument()
    expect(screen.getByText('剪映 5.9 未连接')).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'GPT Video' })).toBeInTheDocument()
  })

  it('uses the lower-left control as a permission selector', async () => {
    mockAgentApi()
    const user = userEvent.setup()
    render(<AgentWorkspace />)

    const trigger = screen.getByRole('button', { name: '权限控制：请求批准' })
    await user.click(trigger)

    const menu = screen.getByRole('menu', { name: '权限模式' })
    expect(within(menu).getByRole('menuitemradio', { name: /^请求批准/ })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await user.click(within(menu).getByRole('menuitemradio', { name: /^完全访问权限/ }))

    expect(screen.getByRole('button', { name: '权限控制：完全访问权限' })).toBeInTheDocument()
    expect(window.localStorage.getItem(AGENT_PERMISSION_MODE_KEY)).toBe('full')
  })

  it('restores the saved permission mode', () => {
    window.localStorage.setItem(AGENT_PERMISSION_MODE_KEY, 'smart')
    mockAgentApi()
    render(<AgentWorkspace />)
    expect(screen.getByRole('button', { name: '权限控制：智能审批' })).toBeInTheDocument()
  })

  it('fills a starter prompt without sending it automatically', async () => {
    const api = mockAgentApi()
    const user = userEvent.setup()
    render(<AgentWorkspace />)
    await screen.findByRole('option', { name: 'GPT Video' })

    await user.click(screen.getByRole('button', { name: '整理批量生产流程' }))

    expect(screen.getByRole('textbox', { name: '描述剪辑任务' })).toHaveValue(
      '为剪映 5.9 固定模板整理一套可执行的批量生产流程。'
    )
    expect(api.startCodexTurn).not.toHaveBeenCalled()
  })

  it('creates a Codex thread and renders streamed message deltas', async () => {
    const api = mockAgentApi({ assistantChunks: ['先确认模板、', '素材和输出规格。'] })
    const user = userEvent.setup()
    render(<AgentWorkspace />)
    await screen.findByRole('option', { name: 'GPT Video' })

    const composer = screen.getByRole('textbox', { name: '描述剪辑任务' })
    await user.type(composer, '帮我规划今天的剪辑任务')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(api.startCodexThread).toHaveBeenCalledWith({
      model: 'gpt-video',
      permissionMode: 'request'
    })
    expect(api.startCodexTurn).toHaveBeenCalledWith({
      threadId: 'thread-1',
      text: '帮我规划今天的剪辑任务',
      permissionMode: 'request'
    })
    const conversation = await screen.findByLabelText('当前会话')
    expect(within(conversation).getByText('帮我规划今天的剪辑任务')).toBeInTheDocument()
    expect(
      await within(conversation).findByText('先确认模板、素材和输出规格。')
    ).toBeInTheDocument()
  })

  it('reuses the Codex thread for follow-up turns', async () => {
    const api = mockAgentApi({ assistantChunks: ['回复'] })
    const user = userEvent.setup()
    render(<AgentWorkspace />)
    await screen.findByRole('option', { name: 'GPT Video' })

    const composer = screen.getByRole('textbox', { name: '描述剪辑任务' })
    await user.type(composer, '第一轮问题')
    await user.keyboard('{Enter}')
    await screen.findByText('回复')
    await user.type(composer, '第二轮问题')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(api.startCodexTurn).toHaveBeenCalledTimes(2))
    expect(api.startCodexThread).toHaveBeenCalledOnce()
    expect(api.startCodexTurn).toHaveBeenNthCalledWith(2, {
      threadId: 'thread-1',
      text: '第二轮问题',
      permissionMode: 'request'
    })
  })

  it('rolls back a failed turn before the next request', async () => {
    const api = mockAgentApi({ assistantChunks: ['已经恢复。'] })
    api.startCodexTurn.mockRejectedValueOnce(new Error('Codex 暂时不可用'))
    const user = userEvent.setup()
    render(<AgentWorkspace />)
    await screen.findByRole('option', { name: 'GPT Video' })

    const composer = screen.getByRole('textbox', { name: '描述剪辑任务' })
    await user.type(composer, '失败的请求')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Codex 暂时不可用')
    expect(screen.queryByText('失败的请求')).not.toBeInTheDocument()
    await user.type(composer, '重新发送')
    await user.keyboard('{Enter}')

    await screen.findByText('已经恢复。')
    expect(api.startCodexThread).toHaveBeenCalledOnce()
  })

  it('restores the last selected Codex model and clears the conversation', async () => {
    window.localStorage.setItem(LAST_USED_AGENT_MODEL_CONFIG_KEY, 'model-2')
    const api = mockAgentApi({
      models: [
        {
          id: 'model-1',
          model: 'first-model',
          displayName: 'First',
          description: '',
          isDefault: true
        },
        {
          id: 'model-2',
          model: 'second-model',
          displayName: 'Second',
          description: '',
          isDefault: false
        }
      ],
      assistantChunks: ['完成']
    })
    const user = userEvent.setup()
    render(<AgentWorkspace />)

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: '模型' })).toHaveValue('model-2')
    )
    const composer = screen.getByRole('textbox', { name: '描述剪辑任务' })
    await user.type(composer, '开始任务')
    await user.keyboard('{Enter}')
    await screen.findByText('完成')
    await user.click(screen.getByRole('button', { name: '新建对话' }))

    expect(screen.getByRole('heading', { name: '想让 Agent 为你剪什么？' })).toBeInTheDocument()
    expect(composer).toHaveValue('')
    expect(screen.getByRole('combobox', { name: '模型' })).toHaveValue('model-2')
    expect(api.interruptCodexTurn).not.toHaveBeenCalled()
  })

  it('falls back from a stale saved model to the Codex default model', async () => {
    window.localStorage.setItem(LAST_USED_AGENT_MODEL_CONFIG_KEY, 'removed-model')
    mockAgentApi({
      models: [
        {
          id: 'model-1',
          model: 'first-model',
          displayName: 'First',
          description: '',
          isDefault: false
        },
        {
          id: 'model-2',
          model: 'default-model',
          displayName: 'Default',
          description: '',
          isDefault: true
        }
      ]
    })
    render(<AgentWorkspace />)

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: '模型' })).toHaveValue('model-2')
    )
    expect(window.localStorage.getItem(LAST_USED_AGENT_MODEL_CONFIG_KEY)).toBe('model-2')
  })

  it('renders and resolves a Codex approval request', async () => {
    const api = mockAgentApi({ assistantChunks: [] })
    const user = userEvent.setup()
    render(<AgentWorkspace />)
    await screen.findByRole('option', { name: 'GPT Video' })
    await user.type(screen.getByRole('textbox', { name: '描述剪辑任务' }), '检查环境')
    await user.keyboard('{Enter}')

    api.emit({
      type: 'approval-requested',
      approval: {
        requestId: 'approval-1',
        threadId: 'thread-1',
        turnId: 'turn-1',
        kind: 'command',
        summary: 'codex --version'
      }
    })
    const approval = await screen.findByLabelText('Agent 操作审批')
    expect(within(approval).getByText('codex --version')).toBeInTheDocument()
    await user.click(within(approval).getByRole('button', { name: '允许一次' }))

    expect(api.respondCodexApproval).toHaveBeenCalledWith({
      requestId: 'approval-1',
      decision: 'accept'
    })
    await waitFor(() => expect(screen.queryByLabelText('Agent 操作审批')).not.toBeInTheDocument())

    api.emit({
      type: 'approval-requested',
      approval: {
        requestId: 'approval-2',
        threadId: 'thread-1',
        turnId: 'turn-1',
        kind: 'mcp-tool',
        summary: '应用字幕修改'
      }
    })
    const mcpApproval = await screen.findByLabelText('Agent 操作审批')
    expect(within(mcpApproval).getByText('剪映工具')).toBeInTheDocument()
    await user.click(within(mcpApproval).getByRole('button', { name: '拒绝' }))
    expect(api.respondCodexApproval).toHaveBeenCalledWith({
      requestId: 'approval-2',
      decision: 'decline'
    })
  })

  it('disables sending when Codex is unavailable', async () => {
    mockAgentApi({ connected: false })
    render(<AgentWorkspace />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Codex 不可用')
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
  })
})
