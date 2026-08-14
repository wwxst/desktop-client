import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AiPanel from '../src/renderer/src/components/AiPanel/AiPanel'
import {
  AI_APPROVAL_MODE_KEY,
  AI_EXECUTION_MODE_KEY
} from '../src/renderer/src/components/AiPanel/aiPanelAgentPreferences'
import { LAST_USED_AGENT_MODEL_CONFIG_KEY } from '../src/renderer/src/components/AiPanel/aiPanelModelPreference'
import {
  createEditorAgentApi,
  registerEditorAgentApi
} from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorAgentApi'
import {
  applyEditorCommand,
  applyEditorCommandsWithResult,
  applyEditorTransactionWithResult,
  type EditorCommand
} from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorCommands'
import {
  createInitialEditorProjectState,
  MAIN_VISUAL_TRACK_ID,
  type EditorProjectState
} from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorProject'
import type {
  AgentApprovalMode,
  AgentChatResponse,
  AgentEditorPlan,
  AgentModelRegistryItem
} from '../src/shared/agent/workflow'
import { isAgentChatRequest } from '../src/shared/agent/chatContract'

let unregisterEditorApi: (() => void) | null = null

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve: (value) => {
      if (!resolvePromise) throw new Error('Deferred promise is not initialized')
      resolvePromise(value)
    }
  }
}

function setAgentModels(configurations: AgentModelRegistryItem[]): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      listAgentModelConfigurations: vi.fn().mockResolvedValue({
        success: true,
        message: '模型配置加载成功',
        configurations
      })
    }
  })
}

function createProject(): EditorProjectState {
  return {
    ...createInitialEditorProjectState('draft-1'),
    assets: [
      {
        id: 'asset-1',
        name: 'one.mp4',
        url: 'blob:one',
        duration: 4,
        status: 'ready',
        kind: 'video'
      },
      {
        id: 'asset-2',
        name: 'two.mp4',
        url: 'blob:two',
        duration: 4,
        status: 'ready',
        kind: 'video'
      }
    ],
    clips: [
      {
        id: 'clip-1',
        assetId: 'asset-1',
        trackId: MAIN_VISUAL_TRACK_ID,
        timelineStart: 0,
        sourceStart: 0,
        sourceEnd: 4,
        duration: 4
      },
      {
        id: 'clip-2',
        assetId: 'asset-2',
        trackId: MAIN_VISUAL_TRACK_ID,
        timelineStart: 4,
        sourceStart: 0,
        sourceEnd: 4,
        duration: 4
      }
    ]
  }
}

function registerTestEditor(revision = { current: 3 }): ReturnType<typeof vi.fn> {
  const project = createProject()
  const executeTransaction = vi.fn((commands: readonly EditorCommand[]) =>
    applyEditorTransactionWithResult(project, commands)
  )
  unregisterEditorApi = registerEditorAgentApi(
    createEditorAgentApi({
      getProject: () => project,
      getRevision: () => revision.current,
      execute: (command) => applyEditorCommand(project, command),
      executeBatch: (commands) => applyEditorCommandsWithResult(project, commands),
      executeTransaction,
      undo: vi.fn(),
      redo: vi.fn()
    })
  )
  return executeTransaction
}

function plan(actions: AgentEditorPlan['actions']): AgentEditorPlan {
  return {
    planId: 'plan-1',
    projectRevision: 3,
    summary: '整理时间线',
    actions
  }
}

function planResponse(editorPlan: AgentEditorPlan): AgentChatResponse {
  return {
    success: true,
    message: '已生成计划',
    assistant: {
      content: '',
      toolCalls: [{ id: 'call-plan-1', name: 'propose_editor_plan', arguments: editorPlan }]
    }
  }
}

function setAgentChat(runAgentChat: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      listAgentModelConfigurations: vi.fn().mockResolvedValue({
        success: true,
        message: '模型配置加载成功',
        configurations: [{ id: 'config-1', kind: 'custom', modelId: 'chat-model' }]
      }),
      runAgentChat
    }
  })
}

async function submitPrompt(
  user: ReturnType<typeof userEvent.setup>,
  text = '整理时间线'
): Promise<void> {
  await screen.findByRole('option', { name: 'chat-model' })
  await user.type(screen.getByRole('textbox', { name: '描述要构建的内容' }), text)
  await user.click(screen.getByRole('button', { name: '发送' }))
}

async function selectApprovalMode(
  user: ReturnType<typeof userEvent.setup>,
  label: '请求批准' | '智能审批' | '完全访问'
): Promise<void> {
  await user.click(screen.getByRole('button', { name: /审批模式/ }))
  await user.click(screen.getByRole('menuitemradio', { name: new RegExp(`^${label}`) }))
}

function readAiPanelCss(): string {
  return readFileSync(
    resolve(process.cwd(), 'src/renderer/src/components/AiPanel/AiPanel.css'),
    'utf8'
  )
}

function getCssBlock(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = css.match(new RegExp(`^${escapedSelector}\\s*\\{([^}]*)\\}`, 'm'))?.[1]
  expect(block, `Missing CSS block for ${selector}`).toBeDefined()
  return block ?? ''
}

describe('AiPanel', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    unregisterEditorApi?.()
    unregisterEditorApi = null
  })

  it('persists Agent and approval preferences while Assistant keeps the saved approval', async () => {
    const user = userEvent.setup()
    const firstMount = render(<AiPanel />)

    expect(screen.getByRole('combobox', { name: '执行模式' })).toHaveValue('agent')
    expect(screen.getByRole('button', { name: '审批模式：请求批准' })).toBeEnabled()

    await selectApprovalMode(user, '智能审批')
    await user.selectOptions(screen.getByRole('combobox', { name: '执行模式' }), 'assistant')

    expect(screen.getByRole('combobox', { name: '执行模式' })).toHaveDisplayValue('助手')
    expect(screen.getByRole('button', { name: '审批模式：智能审批' })).toBeDisabled()
    expect(window.localStorage.getItem(AI_EXECUTION_MODE_KEY)).toBe('assistant')
    expect(window.localStorage.getItem(AI_APPROVAL_MODE_KEY)).toBe('smart')

    firstMount.unmount()
    render(<AiPanel />)

    expect(screen.getByRole('combobox', { name: '执行模式' })).toHaveValue('assistant')
    expect(screen.getByRole('button', { name: '审批模式：智能审批' })).toBeDisabled()
    expect(screen.queryByRole('option', { name: 'Ask' })).not.toBeInTheDocument()
  })

  it('sends the selected mode and retained approval mode with every request', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(AI_APPROVAL_MODE_KEY, 'smart')
    const runAgentChat = vi.fn().mockResolvedValue({
      success: true,
      message: '对话完成',
      assistant: { content: '只提供建议。', toolCalls: [] }
    })
    setAgentChat(runAgentChat)
    render(<AiPanel />)

    await user.selectOptions(screen.getByRole('combobox', { name: '执行模式' }), 'assistant')
    await submitPrompt(user, '分析当前工程')

    await screen.findByText('只提供建议。')
    expect(runAgentChat).toHaveBeenCalledWith({
      configId: 'config-1',
      mode: 'assistant',
      approvalMode: 'smart',
      messages: [{ role: 'user', content: '分析当前工程' }]
    })
  })

  it('starts a clean Assistant conversation instead of reusing Agent plan history', async () => {
    const user = userEvent.setup()
    const executeTransaction = registerTestEditor()
    window.localStorage.setItem(AI_APPROVAL_MODE_KEY, 'full')
    const runAgentChat = vi
      .fn()
      .mockResolvedValueOnce(
        planResponse(plan([{ type: 'clip.move', clipId: 'clip-2', timelineStart: 8 }]))
      )
      .mockResolvedValueOnce({
        success: true,
        message: '对话完成',
        assistant: { content: 'Agent 修改已完成。', toolCalls: [] }
      })
      .mockResolvedValueOnce({
        success: true,
        message: '对话完成',
        assistant: { content: '助手只分析新问题。', toolCalls: [] }
      })
    setAgentChat(runAgentChat)
    render(<AiPanel />)

    await submitPrompt(user, '先修改工程')
    expect(await screen.findByText('Agent 修改已完成。')).toBeInTheDocument()
    expect(executeTransaction).toHaveBeenCalledOnce()

    await user.selectOptions(screen.getByRole('combobox', { name: '执行模式' }), 'assistant')

    expect(screen.getByText('欢迎使用智剪')).toBeInTheDocument()
    expect(screen.queryByText('Agent 修改已完成。')).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: '描述要构建的内容' }), '只分析新问题')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByText('助手只分析新问题。')).toBeInTheDocument()
    const assistantRequest = runAgentChat.mock.calls[2][0]
    expect(isAgentChatRequest(assistantRequest)).toBe(true)
    expect(assistantRequest).toMatchObject({
      mode: 'assistant',
      messages: [{ role: 'user', content: '只分析新问题' }]
    })
  })

  it('does not apply a stale smart plan after a new conversation starts', async () => {
    const user = userEvent.setup()
    const executeTransaction = registerTestEditor()
    window.localStorage.setItem(AI_APPROVAL_MODE_KEY, 'smart')
    const pendingResponse = createDeferred<AgentChatResponse>()
    const runAgentChat = vi.fn().mockReturnValueOnce(pendingResponse.promise)
    setAgentChat(runAgentChat)
    render(<AiPanel />)

    await submitPrompt(user, '稍后返回计划')
    await waitFor(() => expect(runAgentChat).toHaveBeenCalledOnce())
    await user.click(screen.getByRole('button', { name: '新建会话' }))

    await act(async () => {
      pendingResponse.resolve({
        ...planResponse(plan([{ type: 'clip.move', clipId: 'clip-2', timelineStart: 8 }])),
        assistant: {
          content: '这条旧回答不应出现',
          toolCalls: [
            {
              id: 'call-plan-1',
              name: 'propose_editor_plan',
              arguments: plan([{ type: 'clip.move', clipId: 'clip-2', timelineStart: 8 }])
            }
          ]
        }
      })
      await Promise.resolve()
    })

    expect(executeTransaction).not.toHaveBeenCalled()
    expect(screen.getByText('欢迎使用智剪')).toBeInTheDocument()
    expect(screen.queryByText('这条旧回答不应出现')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '批准执行' })).not.toBeInTheDocument()
  })

  it('does not apply a stale full-access plan after the panel unmounts', async () => {
    const user = userEvent.setup()
    const executeTransaction = registerTestEditor()
    window.localStorage.setItem(AI_APPROVAL_MODE_KEY, 'full')
    const pendingResponse = createDeferred<AgentChatResponse>()
    const runAgentChat = vi.fn().mockReturnValueOnce(pendingResponse.promise)
    setAgentChat(runAgentChat)
    const mounted = render(<AiPanel />)

    await submitPrompt(user, '卸载后返回计划')
    await waitFor(() => expect(runAgentChat).toHaveBeenCalledOnce())
    mounted.unmount()

    await act(async () => {
      pendingResponse.resolve(planResponse(plan([{ type: 'clip.delete', clipIds: ['clip-1'] }])))
      await Promise.resolve()
    })

    expect(executeTransaction).not.toHaveBeenCalled()
  })

  it('closes and disables the approval menu when a plan enters the pending state', async () => {
    const user = userEvent.setup()
    registerTestEditor()
    const runAgentChat = vi
      .fn()
      .mockResolvedValueOnce(planResponse(plan([{ type: 'clip.delete', clipIds: ['clip-1'] }])))
    setAgentChat(runAgentChat)
    render(<AiPanel />)

    await screen.findByRole('option', { name: 'chat-model' })
    await user.type(screen.getByRole('textbox', { name: '描述要构建的内容' }), '删除片段')
    await user.click(screen.getByRole('button', { name: '审批模式：请求批准' }))
    expect(screen.getByRole('menu', { name: '审批模式' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByRole('button', { name: '批准执行' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '审批模式：请求批准' })).toBeDisabled()
    expect(screen.queryByRole('menu', { name: '审批模式' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem(AI_APPROVAL_MODE_KEY)).toBeNull()
  })

  it('supports keyboard navigation in the approval menu and restores trigger focus', async () => {
    const user = userEvent.setup()
    render(<AiPanel />)
    const trigger = screen.getByRole('button', { name: '审批模式：请求批准' })

    await user.click(trigger)
    const requestItem = screen.getByRole('menuitemradio', { name: /^请求批准/ })
    const smartItem = screen.getByRole('menuitemradio', { name: /^智能审批/ })
    const fullItem = screen.getByRole('menuitemradio', { name: /^完全访问/ })
    await waitFor(() => expect(requestItem).toHaveFocus())

    await user.keyboard('{ArrowDown}')
    expect(smartItem).toHaveFocus()
    await user.keyboard('{End}')
    expect(fullItem).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(requestItem).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(fullItem).toHaveFocus()
    await user.keyboard('{Home}')
    expect(requestItem).toHaveFocus()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu', { name: '审批模式' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('rejects a forged Assistant plan without executing it and resumes the model', async () => {
    const user = userEvent.setup()
    const executeTransaction = registerTestEditor()
    const editorPlan = plan([{ type: 'clip.move', clipId: 'clip-2', timelineStart: 8 }])
    const runAgentChat = vi
      .fn()
      .mockResolvedValueOnce(planResponse(editorPlan))
      .mockResolvedValueOnce({
        success: true,
        message: '对话完成',
        assistant: { content: '助手模式只能提供建议。', toolCalls: [] }
      })
    setAgentChat(runAgentChat)
    render(<AiPanel />)

    await user.selectOptions(screen.getByRole('combobox', { name: '执行模式' }), 'assistant')
    await submitPrompt(user)

    expect(await screen.findByText('助手模式只能提供建议。')).toBeInTheDocument()
    expect(executeTransaction).not.toHaveBeenCalled()
    expect(JSON.parse(runAgentChat.mock.calls[1][0].messages.at(-1).content)).toMatchObject({
      code: 'UNSUPPORTED_ACTION',
      changed: false
    })
  })

  it.each<AgentApprovalMode>(['request', 'smart', 'full'])(
    'rejects every competing plan and completes all tool results in %s mode',
    async (selectedApprovalMode) => {
      const user = userEvent.setup()
      const executeTransaction = registerTestEditor()
      window.localStorage.setItem(AI_APPROVAL_MODE_KEY, selectedApprovalMode)
      const firstPlan = plan([{ type: 'clip.move', clipId: 'clip-2', timelineStart: 8 }])
      const secondPlan = {
        ...plan([{ type: 'clip.update', clipId: 'clip-1', patch: { opacity: 0.5 } }]),
        planId: 'plan-2'
      }
      const runAgentChat = vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          message: '已生成计划',
          assistant: {
            content: '',
            toolCalls: [
              { id: 'call-context', name: 'get_editor_context', arguments: {} },
              { id: 'call-plan-1', name: 'propose_editor_plan', arguments: firstPlan },
              { id: 'call-plan-2', name: 'propose_editor_plan', arguments: secondPlan }
            ]
          }
        })
        .mockResolvedValueOnce({
          success: true,
          message: '对话完成',
          assistant: { content: '一次只能处理一个编辑计划，请重新规划。', toolCalls: [] }
        })
      setAgentChat(runAgentChat)
      render(<AiPanel />)

      await submitPrompt(user)

      expect(await screen.findByText('一次只能处理一个编辑计划，请重新规划。')).toBeInTheDocument()
      expect(executeTransaction).not.toHaveBeenCalled()
      expect(screen.queryByRole('button', { name: '批准执行' })).not.toBeInTheDocument()
      expect(runAgentChat).toHaveBeenCalledTimes(2)

      const continuationRequest = runAgentChat.mock.calls[1][0]
      expect(isAgentChatRequest(continuationRequest)).toBe(true)
      const toolMessages = continuationRequest.messages.filter(
        (message: { role: string }) => message.role === 'tool'
      )
      expect(toolMessages.map((message: { toolCallId: string }) => message.toolCallId)).toEqual([
        'call-context',
        'call-plan-1',
        'call-plan-2'
      ])
      expect(JSON.parse(toolMessages[0].content)).toMatchObject({ code: 'OK', changed: false })
      for (const toolMessage of toolMessages.slice(1)) {
        expect(JSON.parse(toolMessage.content)).toMatchObject({
          code: 'REJECTED',
          changed: false,
          message: '同一轮只能提交一个编辑计划，请重新规划'
        })
      }
    }
  )

  it('keeps context reading and one request-mode plan in the normal approval flow', async () => {
    const user = userEvent.setup()
    const executeTransaction = registerTestEditor()
    const editorPlan = plan([{ type: 'clip.move', clipId: 'clip-2', timelineStart: 8 }])
    const runAgentChat = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        message: '已生成计划',
        assistant: {
          content: '',
          toolCalls: [
            { id: 'call-context', name: 'get_editor_context', arguments: {} },
            { id: 'call-plan-1', name: 'propose_editor_plan', arguments: editorPlan }
          ]
        }
      })
      .mockResolvedValueOnce({
        success: true,
        message: '对话完成',
        assistant: { content: '单个计划已执行。', toolCalls: [] }
      })
    setAgentChat(runAgentChat)
    render(<AiPanel />)

    await submitPrompt(user)
    const approval = await screen.findByRole('region', { name: '审批计划 整理时间线' })
    expect(executeTransaction).not.toHaveBeenCalled()

    await user.click(within(approval).getByRole('button', { name: '批准执行' }))

    expect(await screen.findByText('单个计划已执行。')).toBeInTheDocument()
    expect(executeTransaction).toHaveBeenCalledOnce()
    const continuationRequest = runAgentChat.mock.calls[1][0]
    expect(isAgentChatRequest(continuationRequest)).toBe(true)
    expect(
      continuationRequest.messages
        .filter((message: { role: string }) => message.role === 'tool')
        .map((message: { toolCallId: string }) => message.toolCallId)
    ).toEqual(['call-context', 'call-plan-1'])
  })

  it.each([
    {
      name: 'approves a request-mode plan',
      approvalMode: 'request' as const,
      actions: [{ type: 'clip.move' as const, clipId: 'clip-2', timelineStart: 8 }],
      command: '批准执行',
      stale: false,
      expectedCode: 'OK',
      expectedTransactions: 1
    },
    {
      name: 'rejects a request-mode plan',
      approvalMode: 'request' as const,
      actions: [{ type: 'clip.move' as const, clipId: 'clip-2', timelineStart: 8 }],
      command: '拒绝',
      stale: false,
      expectedCode: 'REJECTED',
      expectedTransactions: 0
    },
    {
      name: 'invalidates a smart delete plan',
      approvalMode: 'smart' as const,
      actions: [{ type: 'clip.delete' as const, clipIds: ['clip-1'] }],
      command: '批准执行',
      stale: true,
      expectedCode: 'STALE_CONTEXT',
      expectedTransactions: 0
    }
  ])(
    'completes plan-first tool history when it $name',
    async ({
      approvalMode: selectedApprovalMode,
      actions,
      command,
      stale,
      expectedCode,
      expectedTransactions
    }) => {
      const user = userEvent.setup()
      const revision = { current: 3 }
      const executeTransaction = registerTestEditor(revision)
      window.localStorage.setItem(AI_APPROVAL_MODE_KEY, selectedApprovalMode)
      const runAgentChat = vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          message: '已生成计划',
          assistant: {
            content: '',
            toolCalls: [
              {
                id: 'call-plan-1',
                name: 'propose_editor_plan',
                arguments: plan(actions as AgentEditorPlan['actions'])
              },
              { id: 'call-context', name: 'get_editor_context', arguments: {} }
            ]
          }
        })
        .mockResolvedValueOnce({
          success: true,
          message: '对话完成',
          assistant: { content: '工具结果已经完整处理。', toolCalls: [] }
        })
      setAgentChat(runAgentChat)
      render(<AiPanel />)

      await submitPrompt(user)
      const approval = await screen.findByRole('region', { name: '审批计划 整理时间线' })
      expect(runAgentChat).toHaveBeenCalledOnce()
      expect(executeTransaction).not.toHaveBeenCalled()
      if (stale) revision.current = 4

      await user.click(within(approval).getByRole('button', { name: command }))

      expect(await screen.findByText('工具结果已经完整处理。')).toBeInTheDocument()
      expect(executeTransaction).toHaveBeenCalledTimes(expectedTransactions)
      const continuationRequest = runAgentChat.mock.calls[1][0]
      expect(isAgentChatRequest(continuationRequest)).toBe(true)
      const toolMessages = continuationRequest.messages.filter(
        (message: { role: string }) => message.role === 'tool'
      )
      expect(toolMessages.map((message: { toolCallId: string }) => message.toolCallId)).toEqual([
        'call-plan-1',
        'call-context'
      ])
      expect(JSON.parse(toolMessages[0].content)).toMatchObject({
        code: expectedCode,
        changed: expectedTransactions === 1
      })
      expect(JSON.parse(toolMessages[1].content)).toMatchObject({ code: 'OK', changed: false })
    }
  )

  it('waits in request mode, executes once after approval, and resumes with structured history', async () => {
    const user = userEvent.setup()
    const executeTransaction = registerTestEditor()
    const editorPlan = plan([{ type: 'clip.move', clipId: 'clip-2', timelineStart: 8 }])
    const runAgentChat = vi
      .fn()
      .mockResolvedValueOnce(planResponse(editorPlan))
      .mockResolvedValueOnce({
        success: true,
        message: '对话完成',
        assistant: { content: '时间线已经整理完成。', toolCalls: [] }
      })
    setAgentChat(runAgentChat)
    render(<AiPanel />)

    await submitPrompt(user)

    const approval = await screen.findByRole('region', { name: '审批计划 整理时间线' })
    expect(approval).toHaveTextContent('移动 clip-2 到 8 秒')
    expect(executeTransaction).not.toHaveBeenCalled()
    expect(screen.queryByText('AI 正在处理...')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: '执行模式' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '审批模式：请求批准' })).toBeDisabled()

    await user.click(within(approval).getByRole('button', { name: '批准执行' }))

    expect(await screen.findByText('时间线已经整理完成。')).toBeInTheDocument()
    expect(executeTransaction).toHaveBeenCalledOnce()
    expect(JSON.parse(runAgentChat.mock.calls[1][0].messages.at(-1).content)).toMatchObject({
      success: true,
      code: 'OK',
      changed: true,
      affectedClipIds: ['clip-2']
    })
    expect(runAgentChat.mock.calls[1][0].messages.at(-1)).toMatchObject({
      role: 'tool',
      toolCallId: 'call-plan-1',
      name: 'propose_editor_plan'
    })
  })

  it('rejects a pending plan without editing and resumes for an explanation', async () => {
    const user = userEvent.setup()
    const executeTransaction = registerTestEditor()
    const runAgentChat = vi
      .fn()
      .mockResolvedValueOnce(planResponse(plan([{ type: 'clip.delete', clipIds: ['clip-1'] }])))
      .mockResolvedValueOnce({
        success: true,
        message: '对话完成',
        assistant: { content: '已取消这次修改。', toolCalls: [] }
      })
    setAgentChat(runAgentChat)
    render(<AiPanel />)

    await submitPrompt(user)
    await user.click(await screen.findByRole('button', { name: '拒绝' }))

    expect(await screen.findByText('已取消这次修改。')).toBeInTheDocument()
    expect(executeTransaction).not.toHaveBeenCalled()
    expect(JSON.parse(runAgentChat.mock.calls[1][0].messages.at(-1).content)).toMatchObject({
      success: false,
      code: 'REJECTED',
      changed: false
    })
  })

  it('auto executes a single smart move', async () => {
    const user = userEvent.setup()
    const executeTransaction = registerTestEditor()
    window.localStorage.setItem(AI_APPROVAL_MODE_KEY, 'smart')
    const runAgentChat = vi
      .fn()
      .mockResolvedValueOnce(
        planResponse(plan([{ type: 'clip.move', clipId: 'clip-2', timelineStart: 8 }]))
      )
      .mockResolvedValueOnce({
        success: true,
        message: '对话完成',
        assistant: { content: '已自动移动片段。', toolCalls: [] }
      })
    setAgentChat(runAgentChat)
    render(<AiPanel />)

    await submitPrompt(user)

    expect(await screen.findByText('已自动移动片段。')).toBeInTheDocument()
    expect(executeTransaction).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: '批准执行' })).not.toBeInTheDocument()
  })

  it.each([
    {
      name: 'delete',
      actions: [{ type: 'clip.delete' as const, clipIds: ['clip-1'] }]
    },
    {
      name: 'multiple actions',
      actions: [
        { type: 'clip.move' as const, clipId: 'clip-2', timelineStart: 8 },
        { type: 'clip.update' as const, clipId: 'clip-1', patch: { opacity: 0.5 } }
      ]
    }
  ])('waits for approval for smart $name plans', async ({ actions }) => {
    const user = userEvent.setup()
    const executeTransaction = registerTestEditor()
    window.localStorage.setItem(AI_APPROVAL_MODE_KEY, 'smart')
    const runAgentChat = vi.fn().mockResolvedValueOnce(planResponse(plan(actions)))
    setAgentChat(runAgentChat)
    render(<AiPanel />)

    await submitPrompt(user)

    expect(await screen.findByRole('button', { name: '批准执行' })).toBeInTheDocument()
    expect(executeTransaction).not.toHaveBeenCalled()
    expect(runAgentChat).toHaveBeenCalledOnce()
  })

  it('auto executes delete plans in full mode', async () => {
    const user = userEvent.setup()
    const executeTransaction = registerTestEditor()
    window.localStorage.setItem(AI_APPROVAL_MODE_KEY, 'full')
    const runAgentChat = vi
      .fn()
      .mockResolvedValueOnce(planResponse(plan([{ type: 'clip.delete', clipIds: ['clip-1'] }])))
      .mockResolvedValueOnce({
        success: true,
        message: '对话完成',
        assistant: { content: '已自动删除片段。', toolCalls: [] }
      })
    setAgentChat(runAgentChat)
    render(<AiPanel />)

    await submitPrompt(user)

    expect(await screen.findByText('已自动删除片段。')).toBeInTheDocument()
    expect(executeTransaction).toHaveBeenCalledOnce()
  })

  it('returns STALE_CONTEXT without editing when revision changes while waiting', async () => {
    const user = userEvent.setup()
    const revision = { current: 3 }
    const executeTransaction = registerTestEditor(revision)
    const runAgentChat = vi
      .fn()
      .mockResolvedValueOnce(
        planResponse(plan([{ type: 'clip.move', clipId: 'clip-2', timelineStart: 8 }]))
      )
      .mockResolvedValueOnce({
        success: true,
        message: '对话完成',
        assistant: { content: '工程已变化，需要重新规划。', toolCalls: [] }
      })
    setAgentChat(runAgentChat)
    render(<AiPanel />)

    await submitPrompt(user)
    revision.current = 4
    await user.click(await screen.findByRole('button', { name: '批准执行' }))

    expect(await screen.findByText('工程已变化，需要重新规划。')).toBeInTheDocument()
    expect(executeTransaction).not.toHaveBeenCalled()
    expect(JSON.parse(runAgentChat.mock.calls[1][0].messages.at(-1).content)).toMatchObject({
      code: 'STALE_CONTEXT',
      changed: false
    })
  })

  it('starts a clean conversation by rejecting and clearing a pending plan without editing', async () => {
    const user = userEvent.setup()
    const executeTransaction = registerTestEditor()
    const runAgentChat = vi
      .fn()
      .mockResolvedValueOnce(planResponse(plan([{ type: 'clip.delete', clipIds: ['clip-1'] }])))
    setAgentChat(runAgentChat)
    render(<AiPanel />)

    await submitPrompt(user)
    expect(await screen.findByRole('button', { name: '批准执行' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新建会话' }))

    expect(screen.queryByRole('button', { name: '批准执行' })).not.toBeInTheDocument()
    expect(screen.getByText('欢迎使用智剪')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '执行模式' })).toBeEnabled()
    expect(executeTransaction).not.toHaveBeenCalled()
    expect(runAgentChat).toHaveBeenCalledOnce()
  })

  it('renders the chat shell and switches to Codex mode', async () => {
    const user = userEvent.setup()
    render(<AiPanel />)

    const panel = screen.getByRole('region', { name: 'AI 助手' })
    const composer = screen.getByRole('textbox', { name: '描述要构建的内容' })
    expect(panel).toHaveClass('is-empty')
    expect(screen.getByText('欢迎使用智剪')).toBeInTheDocument()
    expect(screen.getByText('让我们开始吧')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '小说推文' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '短剧' })).toBeInTheDocument()
    expect(composer).toHaveAttribute('placeholder', '描述要构建的内容')
    expect(screen.getByText('桌面端自动剪辑产品PRD.md')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()

    await user.click(screen.getByRole('tab', { name: 'CODEX' }))

    expect(screen.getByRole('tab', { name: 'CODEX' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('欢迎使用智剪')).toBeInTheDocument()
  })

  it('fills the composer from each empty-state starter card', async () => {
    const user = userEvent.setup()
    render(<AiPanel />)
    const composer = screen.getByRole('textbox', { name: '描述要构建的内容' })

    for (const label of ['小说推文', '短剧']) {
      await user.click(screen.getByRole('button', { name: label }))
      expect(composer).toHaveValue(label)
    }
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

  it('renders the conversation as right-aligned user bubbles and assistant prose', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    const runAgentChat = vi.fn().mockResolvedValue({
      success: true,
      message: '对话完成',
      assistant: { content: '我会先读取工程，再给出剪辑建议。', toolCalls: [] }
    })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listAgentModelConfigurations: vi.fn().mockResolvedValue({
          success: true,
          message: '模型配置加载成功',
          configurations: [{ id: 'config-1', kind: 'custom', modelId: 'chat-model' }]
        }),
        runAgentChat
      }
    })
    render(<AiPanel />)

    await screen.findByRole('option', { name: 'chat-model' })
    await user.selectOptions(screen.getByRole('combobox', { name: '模型' }), 'config-1')
    await user.type(screen.getByRole('textbox', { name: '描述要构建的内容' }), '帮我整理时间线')
    await user.click(screen.getByRole('button', { name: '发送' }))

    const userMessage = screen.getByText('帮我整理时间线').closest('article')
    const assistantMessage = await screen.findByText('我会先读取工程，再给出剪辑建议。')
    expect(userMessage).toHaveClass('is-user')
    expect(userMessage).toHaveAttribute('data-layout', 'bubble')
    const copyButton = within(userMessage as HTMLElement).getByRole('button', {
      name: '复制消息'
    })
    expect(copyButton).toBeVisible()
    await user.click(copyButton)
    expect(writeText).toHaveBeenCalledWith('帮我整理时间线')
    expect(within(userMessage as HTMLElement).getByRole('button', { name: '已复制' })).toBeVisible()
    expect(assistantMessage.closest('article')).toHaveClass('is-assistant')
    expect(assistantMessage.closest('article')).toHaveAttribute('data-layout', 'prose')
  })

  it('loads model configurations and renders the assistant response', async () => {
    const user = userEvent.setup()
    const runAgentChat = vi.fn().mockResolvedValue({
      success: true,
      message: '对话完成',
      assistant: { content: '我已读取当前工程。', toolCalls: [] }
    })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listAgentModelConfigurations: vi.fn().mockResolvedValue({
          success: true,
          message: '模型配置加载成功',
          configurations: [
            {
              id: 'config-1',
              kind: 'provider',
              providerId: 'openai',
              providerName: 'OpenAI',
              modelId: 'gpt-5.6-terra',
              modelName: 'GPT-5.6 Terra'
            }
          ]
        }),
        runAgentChat
      }
    })
    render(<AiPanel />)

    expect(
      await screen.findByRole('option', { name: 'OpenAI / GPT-5.6 Terra' })
    ).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: '模型' }), 'config-1')
    await user.type(screen.getByRole('textbox', { name: '描述要构建的内容' }), '看看当前工程')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(runAgentChat).toHaveBeenCalledWith({
      configId: 'config-1',
      mode: 'agent',
      approvalMode: 'request',
      messages: [{ role: 'user', content: '看看当前工程' }]
    })
    expect(await screen.findByText('我已读取当前工程。')).toBeInTheDocument()
  })

  it('selects the only configured model by default', async () => {
    setAgentModels([{ id: 'config-1', kind: 'custom', modelId: 'chat-model' }])
    render(<AiPanel />)

    await screen.findByRole('option', { name: 'chat-model' })
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '模型' })).toHaveValue('config-1')
    })
    expect(window.localStorage.getItem(LAST_USED_AGENT_MODEL_CONFIG_KEY)).toBe('config-1')
  })

  it('restores the model selected during the previous mount', async () => {
    const user = userEvent.setup()
    setAgentModels([
      { id: 'config-1', kind: 'custom', modelId: 'first-model' },
      { id: 'config-2', kind: 'custom', modelId: 'second-model' }
    ])
    const firstMount = render(<AiPanel />)
    await screen.findByRole('option', { name: 'second-model' })
    await user.selectOptions(screen.getByRole('combobox', { name: '模型' }), 'config-2')
    firstMount.unmount()
    render(<AiPanel />)

    await screen.findByRole('option', { name: 'second-model' })
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '模型' })).toHaveValue('config-2')
    })
  })

  it('replaces a deleted stored model with the first available model', async () => {
    window.localStorage.setItem(LAST_USED_AGENT_MODEL_CONFIG_KEY, 'deleted-config')
    setAgentModels([{ id: 'config-1', kind: 'custom', modelId: 'first-model' }])
    render(<AiPanel />)

    await screen.findByRole('option', { name: 'first-model' })
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '模型' })).toHaveValue('config-1')
    })
    expect(window.localStorage.getItem(LAST_USED_AGENT_MODEL_CONFIG_KEY)).toBe('config-1')
  })

  it('clears a deleted stored model when no models remain', async () => {
    window.localStorage.setItem(LAST_USED_AGENT_MODEL_CONFIG_KEY, 'deleted-config')
    setAgentModels([])
    render(<AiPanel />)

    expect(await screen.findByRole('alert')).toHaveTextContent('请先在设置中添加模型')
    expect(screen.getByRole('combobox', { name: '模型' })).toHaveValue('')
    expect(window.localStorage.getItem(LAST_USED_AGENT_MODEL_CONFIG_KEY)).toBeNull()
  })

  it('returns tool results to the model before rendering the final response', async () => {
    const user = userEvent.setup()
    const runAgentChat = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        message: '对话完成',
        assistant: {
          content: '',
          toolCalls: [{ id: 'call-1', name: 'get_editor_context', arguments: {} }]
        }
      })
      .mockResolvedValueOnce({
        success: true,
        message: '对话完成',
        assistant: { content: '当前没有打开剪辑工程。', toolCalls: [] }
      })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listAgentModelConfigurations: vi.fn().mockResolvedValue({
          success: true,
          message: '模型配置加载成功',
          configurations: [{ id: 'config-1', kind: 'custom', modelId: 'chat-model' }]
        }),
        runAgentChat
      }
    })
    render(<AiPanel />)

    await screen.findByRole('option', { name: 'chat-model' })
    await user.selectOptions(screen.getByRole('combobox', { name: '模型' }), 'config-1')
    await user.type(screen.getByRole('textbox', { name: '描述要构建的内容' }), '读取工程')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByText('当前没有打开剪辑工程。')).toBeInTheDocument()
    const toolResult = screen.getByText('当前没有打开剪辑工程').closest('article')
    expect(toolResult).toHaveClass('is-tool', 'is-failure')
    expect(toolResult).toHaveAttribute('data-layout', 'tool-result')
    expect(toolResult).toHaveTextContent('读取工程')
    expect(runAgentChat).toHaveBeenCalledTimes(2)
    expect(runAgentChat.mock.calls[1][0].messages).toEqual([
      { role: 'user', content: '读取工程' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call-1', name: 'get_editor_context', arguments: {} }]
      },
      {
        role: 'tool',
        name: 'get_editor_context',
        toolCallId: 'call-1',
        content: JSON.stringify({
          success: false,
          code: 'EDITOR_UNAVAILABLE',
          message: '当前没有打开剪辑工程',
          changed: false,
          affectedClipIds: []
        })
      }
    ])
  })

  it('keeps structured tool history when the user sends a follow-up message', async () => {
    const user = userEvent.setup()
    const toolCall = { id: 'call-1', name: 'get_editor_context', arguments: {} } as const
    const toolResult = JSON.stringify({
      success: false,
      code: 'EDITOR_UNAVAILABLE',
      message: '当前没有打开剪辑工程',
      changed: false,
      affectedClipIds: []
    })
    const runAgentChat = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        message: '对话完成',
        assistant: { content: '', toolCalls: [toolCall] }
      })
      .mockResolvedValueOnce({
        success: true,
        message: '对话完成',
        assistant: { content: '当前没有打开剪辑工程。', toolCalls: [] }
      })
      .mockResolvedValueOnce({
        success: true,
        message: '对话完成',
        assistant: { content: '请先打开一个剪辑工程。', toolCalls: [] }
      })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listAgentModelConfigurations: vi.fn().mockResolvedValue({
          success: true,
          message: '模型配置加载成功',
          configurations: [{ id: 'config-1', kind: 'custom', modelId: 'chat-model' }]
        }),
        runAgentChat
      }
    })
    render(<AiPanel />)

    await screen.findByRole('option', { name: 'chat-model' })
    await user.selectOptions(screen.getByRole('combobox', { name: '模型' }), 'config-1')
    const composer = screen.getByRole('textbox', { name: '描述要构建的内容' })
    await user.type(composer, '读取工程')
    await user.click(screen.getByRole('button', { name: '发送' }))
    await screen.findByText('当前没有打开剪辑工程。')

    await user.type(composer, '那我应该怎么办？')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByText('请先打开一个剪辑工程。')).toBeInTheDocument()
    expect(runAgentChat.mock.calls[2][0].messages).toEqual([
      { role: 'user', content: '读取工程' },
      { role: 'assistant', content: '', toolCalls: [toolCall] },
      {
        role: 'tool',
        name: 'get_editor_context',
        toolCallId: 'call-1',
        content: toolResult
      },
      { role: 'assistant', content: '当前没有打开剪辑工程。', toolCalls: [] },
      { role: 'user', content: '那我应该怎么办？' }
    ])
  })

  it('opens the global settings page from the settings button', async () => {
    const user = userEvent.setup()
    const onOpenSettings = vi.fn()
    render(<AiPanel onOpenSettings={onOpenSettings} />)

    await user.click(screen.getByRole('button', { name: 'AI 面板设置' }))

    expect(onOpenSettings).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog', { name: 'AI 面板设置' })).not.toBeInTheDocument()
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

  it('keeps the AI prompt composer neutral while focused', () => {
    const css = readAiPanelCss()
    const composerFocus = getCssBlock(css, '.studio-ai-panel__composer:focus-within')
    const textareaFocus = getCssBlock(css, '.studio-ai-panel__composer textarea:focus-visible')

    expect(css).toContain('AI 输入框聚焦时保留中性边框，不显示蓝色聚焦框。')
    expect(composerFocus).toContain('border-color: #737373;')
    expect(composerFocus).toContain('box-shadow: none;')
    expect(textareaFocus).toContain('outline: none;')
  })

  it('uses the approved corner radius for the AI prompt composer', () => {
    const composer = getCssBlock(readAiPanelCss(), '.studio-ai-panel__composer')

    expect(composer).toContain('border-radius: 18px;')
  })
})
