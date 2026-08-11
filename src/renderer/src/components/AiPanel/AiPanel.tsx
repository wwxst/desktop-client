import {
  ArrowUp,
  BookOpenText,
  Bot,
  ChevronDown,
  Clapperboard,
  Cpu,
  Ellipsis,
  FileText,
  Maximize2,
  Mic,
  Minimize2,
  Monitor,
  PanelRightOpen,
  Plus,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  X
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type JSX,
  type KeyboardEvent
} from 'react'
import './AiPanel.css'

type AiPanelTab = 'chat' | 'codex'
type PopupName = 'history' | 'settings' | 'more' | null

interface AiPanelProps {
  onCollapse?: () => void
  onExpand?: () => void
}

interface ConversationMessage {
  id: number
  text: string
}

const DEFAULT_CONTEXT_FILE = '桌面端自动剪辑产品PRD.md'

function AiPanel({ onCollapse, onExpand }: AiPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<AiPanelTab>('chat')
  const [composerValue, setComposerValue] = useState('')
  const [messages, setMessages] = useState<Record<AiPanelTab, ConversationMessage[]>>({
    chat: [],
    codex: []
  })
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [autoAttachProject, setAutoAttachProject] = useState(true)
  const [openPopup, setOpenPopup] = useState<PopupName>(null)
  const [showComposerOptions, setShowComposerOptions] = useState(false)
  const [thinkingMode, setThinkingMode] = useState('平衡')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const nextMessageIdRef = useRef(1)

  const attachmentName = selectedFileName ?? (autoAttachProject ? DEFAULT_CONTEXT_FILE : null)
  const activeMessages = messages[activeTab]
  const isEmpty = activeMessages.length === 0

  useEffect(() => {
    if (!openPopup) return undefined

    const closePopup = (event: PointerEvent): void => {
      if (!panelRef.current?.contains(event.target as Node)) setOpenPopup(null)
    }
    document.addEventListener('pointerdown', closePopup)
    return () => document.removeEventListener('pointerdown', closePopup)
  }, [openPopup])

  useEffect(() => {
    const handleEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (openPopup) setOpenPopup(null)
      else if (isFullscreen) setIsFullscreen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isFullscreen, openPopup])

  const resetConversation = (): void => {
    setMessages((current) => ({ ...current, [activeTab]: [] }))
    setComposerValue('')
    setSelectedFileName(null)
    setOpenPopup(null)
    if (textareaRef.current) textareaRef.current.style.height = ''
    textareaRef.current?.focus()
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const text = composerValue.trim()
    if (!text) return

    const message = { id: nextMessageIdRef.current, text }
    nextMessageIdRef.current += 1
    setMessages((current) => ({
      ...current,
      [activeTab]: [...current[activeTab], message]
    }))
    setComposerValue('')
    if (textareaRef.current) textareaRef.current.style.height = ''
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  const handleComposerInput = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setComposerValue(event.target.value)
    event.target.style.height = 'auto'
    event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`
  }

  const handleFileSelected = (event: ChangeEvent<HTMLInputElement>): void => {
    setSelectedFileName(event.target.files?.[0]?.name ?? null)
    event.target.value = ''
  }

  const handleCollapse = (): void => {
    setIsFullscreen(false)
    setIsCollapsed(true)
    setOpenPopup(null)
    onCollapse?.()
  }

  const handleExpand = (): void => {
    setIsCollapsed(false)
    onExpand?.()
  }

  const togglePopup = (popup: Exclude<PopupName, null>): void => {
    setOpenPopup((current) => (current === popup ? null : popup))
  }

  const selectStarter = (label: string): void => {
    setComposerValue(label)
    textareaRef.current?.focus()
  }

  if (isCollapsed) {
    return (
      <section ref={panelRef} className="studio-ai-panel is-collapsed" aria-label="AI 助手">
        <button
          className="studio-ai-panel__restore"
          type="button"
          aria-label="打开 AI 面板"
          title="打开 AI 面板"
          onClick={handleExpand}
        >
          <PanelRightOpen size={17} strokeWidth={1.7} aria-hidden="true" />
        </button>
      </section>
    )
  }

  return (
    <section
      ref={panelRef}
      className={`studio-ai-panel${isFullscreen ? ' is-fullscreen' : ''}${isEmpty ? ' is-empty' : ''}`}
      aria-label="AI 助手"
    >
      <header className="studio-ai-panel__header">
        <div className="studio-ai-panel__tabs" role="tablist" aria-label="AI 面板模式">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'chat'}
            onClick={() => setActiveTab('chat')}
          >
            聊天
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'codex'}
            onClick={() => setActiveTab('codex')}
          >
            CODEX
          </button>
        </div>

        <div className="studio-ai-panel__header-actions">
          <button type="button" aria-label="新建会话" title="新建会话" onClick={resetConversation}>
            <Plus size={18} strokeWidth={1.55} aria-hidden="true" />
          </button>
          <div className="studio-ai-panel__popup-anchor">
            <button
              type="button"
              aria-label="会话记录"
              title="会话记录"
              aria-haspopup="menu"
              aria-expanded={openPopup === 'history'}
              onClick={() => togglePopup('history')}
            >
              <ChevronDown size={15} strokeWidth={1.7} aria-hidden="true" />
            </button>
            {openPopup === 'history' && (
              <div
                className="studio-ai-panel__popover studio-ai-panel__popover--history"
                role="menu"
              >
                <span>会话记录</span>
                <p>暂无历史会话</p>
              </div>
            )}
          </div>
          <div className="studio-ai-panel__popup-anchor">
            <button
              type="button"
              aria-label="AI 面板设置"
              title="AI 面板设置"
              aria-haspopup="dialog"
              aria-expanded={openPopup === 'settings'}
              onClick={() => togglePopup('settings')}
            >
              <Settings size={17} strokeWidth={1.55} aria-hidden="true" />
            </button>
            {openPopup === 'settings' && (
              <div
                className="studio-ai-panel__popover studio-ai-panel__popover--settings"
                role="dialog"
                aria-label="AI 面板设置"
              >
                <strong>面板设置</strong>
                <label>
                  <span>自动附加当前项目</span>
                  <input
                    type="checkbox"
                    checked={autoAttachProject}
                    onChange={(event) => setAutoAttachProject(event.target.checked)}
                  />
                </label>
              </div>
            )}
          </div>
          <div className="studio-ai-panel__popup-anchor">
            <button
              type="button"
              aria-label="更多操作"
              title="更多操作"
              aria-haspopup="menu"
              aria-expanded={openPopup === 'more'}
              onClick={() => togglePopup('more')}
            >
              <Ellipsis size={17} strokeWidth={1.7} aria-hidden="true" />
            </button>
            {openPopup === 'more' && (
              <div className="studio-ai-panel__popover studio-ai-panel__popover--menu" role="menu">
                <button type="button" role="menuitem" onClick={resetConversation}>
                  清空当前会话
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setThinkingMode('平衡')
                    setAutoAttachProject(true)
                    setOpenPopup(null)
                  }}
                >
                  恢复默认设置
                </button>
              </div>
            )}
          </div>
          <span className="studio-ai-panel__header-divider" aria-hidden="true" />
          <button
            type="button"
            aria-label={isFullscreen ? '退出全屏' : '全屏显示 AI 面板'}
            title={isFullscreen ? '退出全屏' : '全屏显示 AI 面板'}
            aria-pressed={isFullscreen}
            onClick={() => setIsFullscreen((current) => !current)}
          >
            {isFullscreen ? (
              <Minimize2 size={17} strokeWidth={1.55} aria-hidden="true" />
            ) : (
              <Maximize2 size={17} strokeWidth={1.55} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            aria-label="关闭 AI 面板"
            title="关闭 AI 面板"
            onClick={handleCollapse}
          >
            <X size={19} strokeWidth={1.45} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="studio-ai-panel__conversation">
        {isEmpty ? (
          <div className="studio-ai-panel__empty">
            <span className="studio-ai-panel__empty-icon" aria-hidden="true">
              <Bot size={38} strokeWidth={1.55} />
            </span>
            <strong>欢迎使用智剪</strong>
            <span className="studio-ai-panel__empty-subtitle">让我们开始吧</span>
            <div className="studio-ai-panel__starter-grid" role="group" aria-label="创作类型">
              <button
                className="studio-ai-panel__starter-card is-novel"
                type="button"
                onClick={() => selectStarter('小说推文')}
              >
                <BookOpenText size={16} strokeWidth={1.7} aria-hidden="true" />
                <span>小说推文</span>
              </button>
              <button
                className="studio-ai-panel__starter-card is-drama"
                type="button"
                onClick={() => selectStarter('短剧')}
              >
                <Clapperboard size={16} strokeWidth={1.7} aria-hidden="true" />
                <span>短剧</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="studio-ai-panel__messages" role="log" aria-label="当前会话">
            {activeMessages.map((message) => (
              <article key={message.id} className="studio-ai-panel__message">
                <span>你</span>
                <p>{message.text}</p>
              </article>
            ))}
          </div>
        )}
      </div>

      <form className="studio-ai-panel__composer" onSubmit={handleSubmit}>
        {attachmentName && (
          <div className="studio-ai-panel__attachment">
            <FileText size={13} strokeWidth={1.7} aria-hidden="true" />
            <span>{attachmentName}</span>
            <button
              type="button"
              aria-label={`移除附件 ${attachmentName}`}
              title="移除附件"
              onClick={() => {
                setSelectedFileName(null)
                setAutoAttachProject(false)
              }}
            >
              <X size={12} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={composerValue}
          rows={1}
          aria-label="描述要构建的内容"
          placeholder="描述要构建的内容"
          onChange={handleComposerInput}
          onKeyDown={handleComposerKeyDown}
        />

        {showComposerOptions && (
          <div className="studio-ai-panel__thinking-options" aria-label="思考强度">
            {['快速', '平衡', '深度'].map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={thinkingMode === mode}
                onClick={() => setThinkingMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
        )}

        <div className="studio-ai-panel__composer-toolbar">
          <input
            ref={fileInputRef}
            className="studio-ai-panel__file-input"
            type="file"
            tabIndex={-1}
            aria-hidden="true"
            onChange={handleFileSelected}
          />
          <button
            className="studio-ai-panel__composer-icon"
            type="button"
            aria-label="添加上下文"
            title="添加上下文"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <label className="studio-ai-panel__select" title="选择执行模式">
            <Bot size={13} strokeWidth={1.7} aria-hidden="true" />
            <select aria-label="执行模式" defaultValue="Agent">
              <option>Agent</option>
              <option>Ask</option>
            </select>
          </label>
          <label className="studio-ai-panel__select" title="选择模型">
            <Cpu size={13} strokeWidth={1.7} aria-hidden="true" />
            <select aria-label="模型" defaultValue="Models">
              <option>Models</option>
              <option>本地模型</option>
              <option>规则模式</option>
            </select>
          </label>
          <button
            className="studio-ai-panel__composer-icon"
            type="button"
            aria-label="思考设置"
            title="思考设置"
            aria-pressed={showComposerOptions}
            onClick={() => setShowComposerOptions((current) => !current)}
          >
            <SlidersHorizontal size={15} strokeWidth={1.6} aria-hidden="true" />
          </button>
          <span className="studio-ai-panel__composer-spacer" />
          <button
            className="studio-ai-panel__composer-icon is-circular"
            type="button"
            aria-label="语音输入暂不可用"
            title="语音输入暂不可用"
            disabled
          >
            <Mic size={15} strokeWidth={1.7} aria-hidden="true" />
          </button>
          <button
            className="studio-ai-panel__send"
            type="submit"
            aria-label="发送"
            title="发送"
            disabled={!composerValue.trim()}
          >
            <ArrowUp size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </form>

      <footer className="studio-ai-panel__statusbar">
        <span>
          <Monitor size={13} strokeWidth={1.6} aria-hidden="true" />
          本地
        </span>
        <label title="选择审批模式">
          <ShieldCheck size={13} strokeWidth={1.6} aria-hidden="true" />
          <select aria-label="审批模式" defaultValue="默认审批">
            <option>默认审批</option>
            <option>自动审批</option>
            <option>逐项审批</option>
          </select>
        </label>
      </footer>
    </section>
  )
}

export default AiPanel
