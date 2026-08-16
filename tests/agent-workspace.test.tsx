import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AgentWorkspace from '../src/renderer/src/components/AgentWorkspace/AgentWorkspace'
import { LAST_USED_AGENT_MODEL_CONFIG_KEY } from '../src/renderer/src/components/AgentWorkspace/agentWorkspaceModelPreference'
import { AGENT_PERMISSION_MODE_KEY } from '../src/renderer/src/components/AgentWorkspace/agentWorkspacePermissionPreference'

interface MockAgentApiOptions {
  configurations?: Array<{
    id: string
    kind: 'provider' | 'custom'
    modelId: string
    providerName?: string
    modelName?: string
  }>
  assistantContent?: string
}

function mockAgentApi({
  configurations = [
    {
      id: 'config-1',
      kind: 'provider',
      modelId: 'gpt-video',
      providerName: 'OpenAI',
      modelName: 'GPT Video'
    }
  ],
  assistantContent = '我会先整理素材和剪辑目标。'
}: MockAgentApiOptions = {}): ReturnType<typeof vi.fn> {
  const runAgentChat = vi.fn().mockResolvedValue({
    success: true,
    message: '对话完成',
    assistant: { content: assistantContent }
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      listAgentModelConfigurations: vi.fn().mockResolvedValue({
        success: true,
        message: '模型配置加载成功',
        configurations
      }),
      runAgentChat
    }
  })
  return runAgentChat
}

afterEach(() => {
  window.localStorage.clear()
})

describe('AgentWorkspace', () => {
  it('renders the video editing Agent welcome state and safe context', async () => {
    mockAgentApi()
    render(<AgentWorkspace />)

    expect(screen.getByRole('heading', { name: '想让 Agent 为你剪什么？' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '分析这批视频素材' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '规划小说推文短视频' })).toBeInTheDocument()
    expect(screen.getByLabelText('当前上下文')).toHaveTextContent('未选择项目')
    expect(screen.getByLabelText('当前上下文')).toHaveTextContent('剪映 5.9')
    expect(screen.getByText('请求批准')).toBeInTheDocument()
    expect(screen.getByText('剪映 5.9 未连接')).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'OpenAI / GPT Video' })).toBeInTheDocument()
  })

  it('uses the lower-left control as a permission selector', async () => {
    mockAgentApi()
    const user = userEvent.setup()
    render(<AgentWorkspace />)

    const trigger = screen.getByRole('button', { name: '权限控制：请求批准' })
    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu', { name: '权限模式' })
    expect(within(menu).getByRole('menuitemradio', { name: /^请求批准/ })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(within(menu).getByRole('menuitemradio', { name: /^智能审批/ })).toBeEnabled()
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
    const runAgentChat = mockAgentApi()
    const user = userEvent.setup()
    render(<AgentWorkspace />)
    await screen.findByRole('option', { name: 'OpenAI / GPT Video' })

    await user.click(screen.getByRole('button', { name: '整理批量生产流程' }))

    expect(screen.getByRole('textbox', { name: '描述剪辑任务' })).toHaveValue(
      '为剪映 5.9 固定模板整理一套可执行的批量生产流程。'
    )
    expect(runAgentChat).not.toHaveBeenCalled()
  })

  it('uses the generic chat contract and renders the conversation', async () => {
    const runAgentChat = mockAgentApi({ assistantContent: '先确认模板、素材和输出规格。' })
    const user = userEvent.setup()
    render(<AgentWorkspace />)
    await screen.findByRole('option', { name: 'OpenAI / GPT Video' })

    const composer = screen.getByRole('textbox', { name: '描述剪辑任务' })
    await user.type(composer, '帮我规划今天的剪辑任务')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(runAgentChat).toHaveBeenCalledWith({
      configId: 'config-1',
      messages: [{ role: 'user', content: '帮我规划今天的剪辑任务' }]
    })
    const conversation = await screen.findByLabelText('当前会话')
    expect(within(conversation).getByText('帮我规划今天的剪辑任务')).toBeInTheDocument()
    expect(within(conversation).getByText('先确认模板、素材和输出规格。')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '想让 Agent 为你剪什么？' })
    ).not.toBeInTheDocument()
  })

  it('keeps an alternating conversation for follow-up messages', async () => {
    const runAgentChat = mockAgentApi({ assistantContent: '第一轮回复' })
    const user = userEvent.setup()
    render(<AgentWorkspace />)
    await screen.findByRole('option', { name: 'OpenAI / GPT Video' })

    const composer = screen.getByRole('textbox', { name: '描述剪辑任务' })
    await user.type(composer, '第一轮问题')
    await user.keyboard('{Enter}')
    await screen.findByText('第一轮回复')
    runAgentChat.mockResolvedValueOnce({
      success: true,
      message: '对话完成',
      assistant: { content: '第二轮回复' }
    })
    await user.type(composer, '第二轮问题')
    await user.keyboard('{Enter}')

    await screen.findByText('第二轮回复')
    expect(runAgentChat).toHaveBeenNthCalledWith(2, {
      configId: 'config-1',
      messages: [
        { role: 'user', content: '第一轮问题' },
        { role: 'assistant', content: '第一轮回复' },
        { role: 'user', content: '第二轮问题' }
      ]
    })
  })

  it('rolls back a failed turn before the next request', async () => {
    const runAgentChat = mockAgentApi()
    runAgentChat.mockRejectedValueOnce(new Error('模型暂时不可用')).mockResolvedValueOnce({
      success: true,
      message: '对话完成',
      assistant: { content: '已经恢复。' }
    })
    const user = userEvent.setup()
    render(<AgentWorkspace />)
    await screen.findByRole('option', { name: 'OpenAI / GPT Video' })

    const composer = screen.getByRole('textbox', { name: '描述剪辑任务' })
    await user.type(composer, '失败的请求')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('模型暂时不可用')
    await user.type(composer, '重新发送')
    await user.keyboard('{Enter}')

    await screen.findByText('已经恢复。')
    expect(runAgentChat).toHaveBeenNthCalledWith(2, {
      configId: 'config-1',
      messages: [{ role: 'user', content: '重新发送' }]
    })
  })

  it('restores the last selected model and clears the conversation', async () => {
    window.localStorage.setItem(LAST_USED_AGENT_MODEL_CONFIG_KEY, 'config-2')
    mockAgentApi({
      configurations: [
        { id: 'config-1', kind: 'custom', modelId: 'first-model' },
        { id: 'config-2', kind: 'custom', modelId: 'second-model' }
      ]
    })
    const user = userEvent.setup()
    render(<AgentWorkspace />)

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: '模型' })).toHaveValue('config-2')
    )
    const composer = screen.getByRole('textbox', { name: '描述剪辑任务' })
    await user.type(composer, '开始任务')
    await user.keyboard('{Enter}')
    await screen.findByText('我会先整理素材和剪辑目标。')
    await user.click(screen.getByRole('button', { name: '新建对话' }))

    expect(screen.getByRole('heading', { name: '想让 Agent 为你剪什么？' })).toBeInTheDocument()
    expect(composer).toHaveValue('')
    expect(screen.getByRole('combobox', { name: '模型' })).toHaveValue('config-2')
  })

  it('opens model settings when no model is configured', async () => {
    mockAgentApi({ configurations: [] })
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    render(<AgentWorkspace onOpenSettings={onOpenSettings} />)

    await user.click(await screen.findByRole('button', { name: '配置模型' }))

    expect(onOpenSettings).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent('请先在设置中添加模型')
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
  })
})
