import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AiPanel from '../src/renderer/src/components/AiPanel/AiPanel'

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
      messages: [{ role: 'user', content: '看看当前工程' }]
    })
    expect(await screen.findByText('我已读取当前工程。')).toBeInTheDocument()
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
        content: JSON.stringify({ success: false, message: '当前没有打开剪辑工程' })
      }
    ])
  })

  it('keeps structured tool history when the user sends a follow-up message', async () => {
    const user = userEvent.setup()
    const toolCall = { id: 'call-1', name: 'get_editor_context', arguments: {} } as const
    const toolResult = JSON.stringify({ success: false, message: '当前没有打开剪辑工程' })
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
