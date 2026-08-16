import {
  ArrowUp,
  Bot,
  Captions,
  Check,
  ChevronDown,
  CircleHelp,
  Clapperboard,
  Copy,
  FolderOpen,
  Hand,
  ListChecks,
  MessageSquarePlus,
  MonitorDot,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  type LucideIcon
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type JSX, type KeyboardEvent } from 'react'
import type { AgentChatMessage, AgentModelRegistryItem } from '../../../../shared/agent/workflow'
import {
  readLastUsedAgentModelConfigId,
  resolveAgentModelConfigId,
  writeLastUsedAgentModelConfigId
} from './agentWorkspaceModelPreference'
import {
  readAgentPermissionMode,
  writeAgentPermissionMode,
  type AgentPermissionMode
} from './agentWorkspacePermissionPreference'
import './AgentWorkspace.css'

interface AgentWorkspaceProps {
  onOpenSettings?: () => void
  modelRefreshKey?: number
}

interface ConversationMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
}

interface StarterPrompt {
  title: string
  prompt: string
  icon: LucideIcon
  tone: 'blue' | 'violet' | 'green' | 'orange'
}

interface PermissionOption {
  mode: AgentPermissionMode
  label: string
  description: string
  icon: LucideIcon
}

type AgentChatApi = Pick<typeof window.api, 'listAgentModelConfigurations' | 'runAgentChat'>

const STARTER_PROMPTS: readonly StarterPrompt[] = [
  {
    title: '分析这批视频素材',
    prompt: '帮我分析这批视频素材，整理内容主题、可用镜头和缺失项。',
    icon: Search,
    tone: 'blue'
  },
  {
    title: '规划小说推文短视频',
    prompt: '根据小说正文，规划一条小说推文短视频的剪辑结构。',
    icon: Sparkles,
    tone: 'violet'
  },
  {
    title: '检查字幕与配音',
    prompt: '帮我检查字幕与配音的准备情况，并列出开始剪辑前的问题。',
    icon: Captions,
    tone: 'green'
  },
  {
    title: '整理批量生产流程',
    prompt: '为剪映 5.9 固定模板整理一套可执行的批量生产流程。',
    icon: ListChecks,
    tone: 'orange'
  }
]

const PERMISSION_OPTIONS: readonly PermissionOption[] = [
  {
    mode: 'request',
    label: '请求批准',
    description: '执行剪映操作和修改文件时始终询问',
    icon: Hand
  },
  {
    mode: 'smart',
    label: '智能审批',
    description: '仅对检测到的风险操作请求批准',
    icon: CircleHelp
  },
  {
    mode: 'full',
    label: '完全访问权限',
    description: '自动执行已注册的剪映操作',
    icon: ShieldAlert
  }
]

function getAgentChatApi(): AgentChatApi | null {
  const api = (window as unknown as { api?: unknown }).api
  if (typeof api !== 'object' || api === null) return null
  const candidate = api as Record<string, unknown>
  return typeof candidate.listAgentModelConfigurations === 'function' &&
    typeof candidate.runAgentChat === 'function'
    ? (api as AgentChatApi)
    : null
}

function modelDisplayName(configuration: AgentModelRegistryItem): string {
  const model = configuration.modelName ?? configuration.modelId
  return configuration.providerName ? `${configuration.providerName} / ${model}` : model
}

function AgentWorkspace({ onOpenSettings, modelRefreshKey = 0 }: AgentWorkspaceProps): JSX.Element {
  const [agentApi] = useState<AgentChatApi | null>(() => getAgentChatApi())
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [composerValue, setComposerValue] = useState('')
  const [modelConfigurations, setModelConfigurations] = useState<AgentModelRegistryItem[]>([])
  const [selectedConfigId, setSelectedConfigId] = useState('')
  const [modelLoading, setModelLoading] = useState(agentApi !== null)
  const [isSending, setIsSending] = useState(false)
  const [permissionMode, setPermissionMode] = useState<AgentPermissionMode>(() =>
    readAgentPermissionMode()
  )
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState(agentApi ? '' : 'AI 对话接口不可用')
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const permissionControlRef = useRef<HTMLDivElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<AgentChatMessage[]>([])
  const nextMessageIdRef = useRef(1)
  const requestGenerationRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestGenerationRef.current += 1
    }
  }, [])

  useEffect(() => {
    if (!agentApi) return undefined
    let active = true

    void agentApi
      .listAgentModelConfigurations()
      .then((response) => {
        if (!active) return
        if (!response.success) throw new Error(response.message || '模型配置加载失败')
        setModelConfigurations(response.configurations)
        setSelectedConfigId((current) => {
          const next = resolveAgentModelConfigId(
            response.configurations,
            current,
            readLastUsedAgentModelConfigId()
          )
          writeLastUsedAgentModelConfigId(next)
          return next
        })
        setErrorMessage(response.configurations.length ? '' : '请先在设置中添加模型')
      })
      .catch((error: unknown) => {
        if (active) setErrorMessage(error instanceof Error ? error.message : '模型配置加载失败')
      })
      .finally(() => {
        if (active) setModelLoading(false)
      })

    return () => {
      active = false
    }
  }, [agentApi, modelRefreshKey])

  useEffect(() => {
    const list = messageListRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [isSending, messages.length])

  useEffect(() => {
    if (!permissionMenuOpen) return undefined

    const closeOnPointerDown = (event: PointerEvent): void => {
      if (!permissionControlRef.current?.contains(event.target as Node)) {
        setPermissionMenuOpen(false)
      }
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setPermissionMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [permissionMenuOpen])

  const createMessage = (
    role: ConversationMessage['role'],
    content: string
  ): ConversationMessage => {
    const message = { id: nextMessageIdRef.current, role, content }
    nextMessageIdRef.current += 1
    return message
  }

  const resizeComposer = (): void => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`
  }

  const resetConversation = (): void => {
    requestGenerationRef.current += 1
    historyRef.current = []
    setMessages([])
    setComposerValue('')
    setErrorMessage(modelConfigurations.length ? '' : '请先在设置中添加模型')
    setIsSending(false)
    if (textareaRef.current) textareaRef.current.style.height = ''
    textareaRef.current?.focus()
  }

  const sendMessage = async (): Promise<void> => {
    const prompt = composerValue.trim()
    if (!agentApi || !prompt || !selectedConfigId || isSending) return

    const generation = requestGenerationRef.current + 1
    requestGenerationRef.current = generation
    const userMessage = createMessage('user', prompt)
    const previousHistory = historyRef.current.slice(-58)
    const nextHistory: AgentChatMessage[] = [...previousHistory, { role: 'user', content: prompt }]
    historyRef.current = nextHistory
    setMessages((current) => [...current, userMessage])
    setComposerValue('')
    setErrorMessage('')
    setIsSending(true)
    if (textareaRef.current) textareaRef.current.style.height = ''

    try {
      const response = await agentApi.runAgentChat({
        configId: selectedConfigId,
        messages: nextHistory
      })
      if (!mountedRef.current || requestGenerationRef.current !== generation) return
      if (!response.success || !response.assistant?.content) {
        throw new Error(response.message || 'AI 对话失败')
      }
      const assistantContent = response.assistant.content
      historyRef.current = [...nextHistory, { role: 'assistant', content: assistantContent }]
      setMessages((current) => [...current, createMessage('assistant', assistantContent)])
    } catch (error: unknown) {
      if (!mountedRef.current || requestGenerationRef.current !== generation) return
      historyRef.current = previousHistory
      setErrorMessage(error instanceof Error ? error.message : 'AI 对话失败')
    } finally {
      if (mountedRef.current && requestGenerationRef.current === generation) setIsSending(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void sendMessage()
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void sendMessage()
  }

  const selectStarterPrompt = (prompt: string): void => {
    setComposerValue(prompt)
    requestAnimationFrame(() => {
      resizeComposer()
      textareaRef.current?.focus()
    })
  }

  const selectPermissionMode = (mode: AgentPermissionMode): void => {
    setPermissionMode(mode)
    writeAgentPermissionMode(mode)
    setPermissionMenuOpen(false)
  }

  const copyMessage = async (message: ConversationMessage): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopiedMessageId(message.id)
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === message.id ? null : current))
      }, 1_500)
    } catch {
      setCopiedMessageId(null)
    }
  }

  const isEmpty = messages.length === 0
  const canSend = Boolean(composerValue.trim() && selectedConfigId && agentApi && !isSending)
  const permissionLabel =
    PERMISSION_OPTIONS.find((option) => option.mode === permissionMode)?.label ?? '请求批准'

  return (
    <section className="agent-workspace" aria-label="剪辑 Agent 工作台">
      <header className="agent-workspace__header">
        <div className="agent-workspace__title">
          <Clapperboard size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>{isEmpty ? '新任务' : '当前任务'}</span>
        </div>
        <div className="agent-workspace__header-actions">
          <span className="agent-workspace__connection" title="剪映执行能力尚未接入">
            <MonitorDot size={15} strokeWidth={1.7} aria-hidden="true" />
            剪映 5.9 未连接
          </span>
          <button
            className="agent-workspace__icon-button"
            type="button"
            aria-label="新建对话"
            title="新建对话"
            disabled={isEmpty && !composerValue}
            onClick={resetConversation}
          >
            <MessageSquarePlus size={17} strokeWidth={1.7} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div
        ref={messageListRef}
        className={`agent-workspace__content${isEmpty ? ' is-empty' : ''}`}
        aria-live="polite"
      >
        {isEmpty ? (
          <div className="agent-workspace__welcome">
            <div className="agent-workspace__mark" aria-hidden="true">
              <Bot size={30} strokeWidth={1.55} />
            </div>
            <h1>想让 Agent 为你剪什么？</h1>
            <div className="agent-workspace__starters" aria-label="快捷任务">
              {STARTER_PROMPTS.map((starter) => {
                const Icon = starter.icon
                return (
                  <button
                    key={starter.title}
                    className={`agent-workspace__starter is-${starter.tone}`}
                    type="button"
                    onClick={() => selectStarterPrompt(starter.prompt)}
                  >
                    <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
                    <span>{starter.title}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="agent-workspace__conversation" aria-label="当前会话">
            {messages.map((message) => (
              <article key={message.id} className={`agent-workspace__message is-${message.role}`}>
                {message.role === 'assistant' && (
                  <div className="agent-workspace__assistant-icon" aria-hidden="true">
                    <Bot size={16} strokeWidth={1.7} />
                  </div>
                )}
                <div className="agent-workspace__message-body">
                  <p>{message.content}</p>
                  {message.role === 'assistant' && (
                    <button
                      className="agent-workspace__copy"
                      type="button"
                      aria-label={copiedMessageId === message.id ? '已复制' : '复制消息'}
                      title={copiedMessageId === message.id ? '已复制' : '复制'}
                      onClick={() => void copyMessage(message)}
                    >
                      {copiedMessageId === message.id ? (
                        <Check size={14} aria-hidden="true" />
                      ) : (
                        <Copy size={14} aria-hidden="true" />
                      )}
                    </button>
                  )}
                </div>
              </article>
            ))}
            {isSending && (
              <div className="agent-workspace__thinking" role="status">
                <span />
                <span />
                <span />
                <span className="agent-workspace__thinking-label agent-workspace__sr-only">
                  Agent 正在思考
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="agent-workspace__composer-area">
        <form className="agent-workspace__composer" onSubmit={handleSubmit}>
          <div className="agent-workspace__context" aria-label="当前上下文">
            <span>
              <FolderOpen size={14} strokeWidth={1.7} aria-hidden="true" />
              未选择项目
            </span>
            <span>
              <MonitorDot size={14} strokeWidth={1.7} aria-hidden="true" />
              剪映 5.9
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={composerValue}
            rows={1}
            maxLength={20_000}
            aria-label="描述剪辑任务"
            placeholder="描述你的剪辑任务"
            disabled={isSending}
            onChange={(event) => {
              setComposerValue(event.target.value)
              resizeComposer()
            }}
            onKeyDown={handleComposerKeyDown}
          />
          <div className="agent-workspace__toolbar">
            <div className="agent-workspace__toolbar-group">
              <button
                className="agent-workspace__icon-button"
                type="button"
                aria-label="添加素材"
                title="添加素材（即将支持）"
                disabled
              >
                <Plus size={18} strokeWidth={1.7} aria-hidden="true" />
              </button>
              <div ref={permissionControlRef} className="agent-workspace__permission-control">
                <button
                  className="agent-workspace__permission-trigger"
                  type="button"
                  aria-label={`权限控制：${permissionLabel}`}
                  aria-haspopup="menu"
                  aria-expanded={permissionMenuOpen}
                  onClick={() => setPermissionMenuOpen((current) => !current)}
                >
                  <ShieldCheck size={15} strokeWidth={1.7} aria-hidden="true" />
                  <span>{permissionLabel}</span>
                  <ChevronDown size={13} strokeWidth={1.7} aria-hidden="true" />
                </button>

                {permissionMenuOpen && (
                  <div
                    className="agent-workspace__permission-menu"
                    role="menu"
                    aria-label="权限模式"
                  >
                    <div className="agent-workspace__permission-heading">
                      <span>应如何批准 Agent 操作？</span>
                      <small>剪映连接后生效</small>
                    </div>
                    {PERMISSION_OPTIONS.map((option) => {
                      const Icon = option.icon
                      const isCurrent = option.mode === permissionMode
                      return (
                        <button
                          key={option.mode}
                          className={`agent-workspace__permission-option${
                            isCurrent ? ' is-current' : ''
                          }${option.mode === 'full' ? ' is-full' : ''}`}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isCurrent}
                          onClick={() => selectPermissionMode(option.mode)}
                        >
                          <Icon size={17} strokeWidth={1.7} aria-hidden="true" />
                          <span>
                            <strong>{option.label}</strong>
                            <small>{option.description}</small>
                          </span>
                          {isCurrent && <Check size={15} strokeWidth={1.8} aria-hidden="true" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="agent-workspace__toolbar-group is-end">
              {errorMessage && (
                <span className="agent-workspace__error" role="alert" title={errorMessage}>
                  {errorMessage}
                </span>
              )}
              {!modelLoading && modelConfigurations.length === 0 && onOpenSettings && (
                <button
                  className="agent-workspace__settings-link"
                  type="button"
                  onClick={onOpenSettings}
                >
                  <Settings size={14} strokeWidth={1.7} aria-hidden="true" />
                  配置模型
                </button>
              )}
              <label className="agent-workspace__model">
                <span className="agent-workspace__sr-only">模型</span>
                <select
                  value={selectedConfigId}
                  aria-label="模型"
                  disabled={modelLoading || isSending || modelConfigurations.length === 0}
                  onChange={(event) => {
                    setSelectedConfigId(event.target.value)
                    writeLastUsedAgentModelConfigId(event.target.value)
                    setErrorMessage('')
                  }}
                >
                  <option value="">{modelLoading ? '加载模型...' : '选择模型'}</option>
                  {modelConfigurations.map((configuration) => (
                    <option key={configuration.id} value={configuration.id}>
                      {modelDisplayName(configuration)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="agent-workspace__send"
                type="submit"
                aria-label="发送"
                title="发送"
                disabled={!canSend}
              >
                <ArrowUp size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </div>
        </form>
      </footer>
    </section>
  )
}

export default AgentWorkspace
