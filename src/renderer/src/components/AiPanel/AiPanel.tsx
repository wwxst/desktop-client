import {
  ArrowUp,
  BookOpenText,
  Bot,
  ChevronDown,
  Clapperboard,
  Cpu,
  Check,
  CircleAlert,
  CircleCheck,
  Copy,
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
import type {
  AgentApprovalMode,
  AgentChatMessage,
  AgentChatMode,
  AgentEditorPlan,
  AgentEditorPlanAction,
  AgentModelRegistryItem,
  AgentToolCall,
  AgentToolExecutionResult
} from '../../../../shared/agent/workflow'
import {
  getActiveEditorAgentApi,
  type EditorAgentApi
} from '../SmartEdit/VideoEditorWorkspace/editorAgentApi'
import { decideAgentPlanApproval } from './agentApprovalPolicy'
import { executeAgentToolCall, executeApprovedAgentPlan } from './agentChatTools'
import { preflightAgentEditorPlan } from './agentEditorPlanExecutor'
import {
  readAiApprovalMode,
  readAiExecutionMode,
  writeAiApprovalMode,
  writeAiExecutionMode
} from './aiPanelAgentPreferences'
import {
  readLastUsedAgentModelConfigId,
  resolveAgentModelConfigId,
  writeLastUsedAgentModelConfigId
} from './aiPanelModelPreference'
import './AiPanel.css'

type AiPanelTab = 'chat' | 'codex'
type PopupName = 'history' | 'more' | 'approval' | null
type ApprovalState = 'awaiting' | 'executing' | 'completed' | 'rejected' | 'stale' | 'failed'
type PlanToolCall = Extract<AgentToolCall, { name: 'propose_editor_plan' }>
type ReadToolCall = Extract<AgentToolCall, { name: 'get_editor_context' }>

interface AiPanelProps {
  onCollapse?: () => void
  onExpand?: () => void
  onOpenSettings?: () => void
  modelRefreshKey?: number
}

interface ConversationMessage {
  id: number
  role: 'user' | 'assistant' | 'tool'
  text: string
  createdAt: string
  toolName?: string
  success?: boolean
  plan?: AgentEditorPlan
  approvalState?: ApprovalState
}

interface PendingPlan {
  tab: AiPanelTab
  generation: number
  sourceSessionId: string
  call: PlanToolCall
  conversation: AgentChatMessage[]
  approvalMessageId: number
  toolCalls: AgentToolCall[]
  deferredReadResults: Array<{ call: ReadToolCall; result: AgentToolExecutionResult }>
}

interface ToolContinuation {
  tab: AiPanelTab
  generation: number
  call: AgentToolCall
  conversation: AgentChatMessage[]
  approvalMessageId?: number
}

const DEFAULT_CONTEXT_FILE = '桌面端自动剪辑产品PRD.md'

const TOOL_LABELS: Record<string, string> = {
  get_editor_context: '读取工程',
  propose_editor_plan: '编辑计划'
}

const APPROVAL_OPTIONS: ReadonlyArray<{
  value: AgentApprovalMode
  label: string
  description: string
}> = [
  { value: 'request', label: '请求批准', description: '修改工程前始终询问' },
  { value: 'smart', label: '智能审批', description: '仅对删除、批量和覆盖操作询问' },
  { value: 'full', label: '完全访问', description: '自动执行已注册的编辑操作' }
]

const APPROVAL_LABELS: Record<AgentApprovalMode, string> = {
  request: '请求批准',
  smart: '智能审批',
  full: '完全访问'
}

function formatPlanAction(action: AgentEditorPlanAction): string {
  switch (action.type) {
    case 'clip.delete':
      return `删除 ${action.clipIds.length} 个片段：${action.clipIds.join('、')}${
        action.magnetMainTrack ? '；磁吸主轨道空隙，后续片段移动' : ''
      }`
    case 'clip.split':
      return `分割片段 ${action.clipId}，时间 ${action.at} 秒`
    case 'clip.move':
      return action.trackId
        ? `移动 ${action.clipId} 到 ${action.timelineStart} 秒，目标轨道 ${action.trackId}`
        : `移动 ${action.clipId} 到 ${action.timelineStart} 秒，保持当前轨道`
    case 'clip.update':
      return `修改片段 ${action.clipId}：${formatUpdatePatch(action.patch)}`
    default:
      return assertNever(action)
  }
}

function formatUpdatePatch(
  action: Extract<AgentEditorPlanAction, { type: 'clip.update' }>['patch']
): string {
  const values: string[] = []
  for (const key of ['opacity', 'volume', 'muted', 'speed', 'enabled'] as const) {
    if (action[key] !== undefined) values.push(`${key}=${String(action[key])}`)
  }
  if (action.transform) {
    for (const key of ['x', 'y', 'scaleX', 'scaleY', 'rotation'] as const) {
      if (action.transform[key] !== undefined) {
        values.push(`transform.${key}=${String(action.transform[key])}`)
      }
    }
  }
  return values.join('，')
}

function assertNever(value: never): never {
  throw new Error(`未知计划动作：${JSON.stringify(value)}`)
}

function rejectedResult(): AgentToolExecutionResult {
  return {
    success: false,
    code: 'REJECTED',
    message: '用户已拒绝编辑计划',
    changed: false,
    affectedClipIds: []
  }
}

function competingPlanResult(): AgentToolExecutionResult {
  return {
    success: false,
    code: 'REJECTED',
    message: '同一轮只能提交一个编辑计划，请重新规划',
    changed: false,
    affectedClipIds: []
  }
}

function staleContextResult(): AgentToolExecutionResult {
  return {
    success: false,
    code: 'STALE_CONTEXT',
    message: '工程已发生变化，请重新读取工程并生成计划',
    changed: false,
    affectedClipIds: []
  }
}

function editorUnavailableResult(): AgentToolExecutionResult {
  return {
    success: false,
    code: 'EDITOR_UNAVAILABLE',
    message: '当前没有打开剪辑工程',
    changed: false,
    affectedClipIds: []
  }
}

function executionFailedResult(error: unknown): AgentToolExecutionResult {
  return {
    success: false,
    code: 'EXECUTION_FAILED',
    message: error instanceof Error ? error.message : 'AI 编辑计划执行失败',
    changed: false,
    affectedClipIds: []
  }
}

function validatePlanContext(
  sourceSessionId: string | null,
  editorApi: EditorAgentApi | null,
  plan: AgentEditorPlan
): AgentToolExecutionResult | null {
  if (!sourceSessionId || !editorApi) return editorUnavailableResult()
  try {
    if (editorApi.getSessionId() !== sourceSessionId) return staleContextResult()
    if (editorApi.getRevision() !== plan.projectRevision) return staleContextResult()
    const preflight = preflightAgentEditorPlan(plan, editorApi)
    return preflight.success ? null : preflight
  } catch (error) {
    return executionFailedResult(error)
  }
}

function resultApprovalState(result: AgentToolExecutionResult): ApprovalState {
  if (result.code === 'OK') return 'completed'
  if (result.code === 'REJECTED') return 'rejected'
  if (result.code === 'STALE_CONTEXT') return 'stale'
  return 'failed'
}

function formatMessageTime(date = new Date()): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

function AiPanel({
  onCollapse,
  onExpand,
  onOpenSettings,
  modelRefreshKey = 0
}: AiPanelProps): JSX.Element {
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
  const [modelConfigurations, setModelConfigurations] = useState<AgentModelRegistryItem[]>([])
  const [selectedConfigId, setSelectedConfigId] = useState('')
  const [modelError, setModelError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionMode, setExecutionMode] = useState<AgentChatMode>(() => readAiExecutionMode())
  const [approvalMode, setApprovalMode] = useState<AgentApprovalMode>(() => readAiApprovalMode())
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const approvalTriggerRef = useRef<HTMLButtonElement>(null)
  const approvalItemRefs = useRef<Record<AgentApprovalMode, HTMLButtonElement | null>>({
    request: null,
    smart: null,
    full: null
  })
  const mountedRef = useRef(true)
  const requestGenerationRef = useRef(0)
  const nextMessageIdRef = useRef(1)
  const chatHistoryRef = useRef<Record<AiPanelTab, AgentChatMessage[]>>({ chat: [], codex: [] })

  const attachmentName = selectedFileName ?? (autoAttachProject ? DEFAULT_CONTEXT_FILE : null)
  const chatAvailable = typeof window.api?.runAgentChat === 'function'
  const activeMessages = messages[activeTab]
  const isEmpty = activeMessages.length === 0
  const interactionLocked = isSending || isExecuting || pendingPlan !== null

  const isCurrentGeneration = (generation: number): boolean =>
    mountedRef.current && requestGenerationRef.current === generation

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestGenerationRef.current += 1
    }
  }, [])

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

  useEffect(() => {
    if (openPopup === 'approval') approvalItemRefs.current[approvalMode]?.focus()
  }, [approvalMode, openPopup])

  useEffect(() => {
    const listConfigurations = window.api?.listAgentModelConfigurations
    if (!listConfigurations) return undefined
    let cancelled = false
    void listConfigurations()
      .then((response) => {
        if (cancelled) return
        if (!response.success) {
          setModelError(response.message || '模型配置加载失败')
          return
        }
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
        setModelError(response.configurations.length ? '' : '请先在设置中添加模型')
      })
      .catch((error: unknown) => {
        if (!cancelled) setModelError(error instanceof Error ? error.message : '模型配置加载失败')
      })
    return () => {
      cancelled = true
    }
  }, [modelRefreshKey])

  useEffect(() => {
    const container = messagesRef.current
    if (container) container.scrollTop = container.scrollHeight
  }, [activeMessages.length, isSending])

  const appendMessages = (tab: AiPanelTab, next: ConversationMessage[]): void => {
    setMessages((current) => ({ ...current, [tab]: [...current[tab], ...next] }))
  }

  const createMessage = (
    role: ConversationMessage['role'],
    text: string,
    metadata: Partial<
      Pick<ConversationMessage, 'toolName' | 'success' | 'plan' | 'approvalState'>
    > = {}
  ): ConversationMessage => {
    const message = {
      id: nextMessageIdRef.current,
      role,
      text,
      createdAt: formatMessageTime(),
      ...metadata
    }
    nextMessageIdRef.current += 1
    return message
  }

  const copyMessage = async (message: ConversationMessage): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message.text)
      setCopiedMessageId(message.id)
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === message.id ? null : current))
      }, 1_500)
    } catch {
      setCopiedMessageId(null)
    }
  }

  const updateApprovalMessage = (
    tab: AiPanelTab,
    messageId: number,
    approvalState: ApprovalState
  ): void => {
    setMessages((current) => ({
      ...current,
      [tab]: current[tab].map((message) =>
        message.id === messageId ? { ...message, approvalState } : message
      )
    }))
  }

  const continueAfterToolResult = (
    continuation: ToolContinuation,
    result: AgentToolExecutionResult
  ): AgentChatMessage[] => {
    if (!isCurrentGeneration(continuation.generation)) return continuation.conversation
    const toolMessage: AgentChatMessage = {
      role: 'tool',
      content: JSON.stringify(result),
      toolCallId: continuation.call.id,
      name: continuation.call.name
    }
    const nextConversation = [...continuation.conversation, toolMessage]
    chatHistoryRef.current[continuation.tab] = nextConversation
    appendMessages(continuation.tab, [
      createMessage('tool', result.message, {
        toolName: TOOL_LABELS[continuation.call.name] ?? continuation.call.name,
        success: result.success
      })
    ])
    if (continuation.approvalMessageId !== undefined) {
      updateApprovalMessage(
        continuation.tab,
        continuation.approvalMessageId,
        resultApprovalState(result)
      )
    }
    return nextConversation
  }

  const continueAfterPendingPlan = (
    pending: PendingPlan,
    planResult: AgentToolExecutionResult
  ): AgentChatMessage[] => {
    if (!isCurrentGeneration(pending.generation)) return pending.conversation
    const readResults = new Map(
      pending.deferredReadResults.map(({ call, result }) => [call.id, result] as const)
    )
    let conversation = pending.conversation
    for (const call of pending.toolCalls) {
      const result = call.id === pending.call.id ? planResult : readResults.get(call.id)
      if (!result) throw new Error(`缺少工具结果：${call.id}`)
      conversation = continueAfterToolResult(
        {
          tab: pending.tab,
          generation: pending.generation,
          call,
          conversation,
          ...(call.id === pending.call.id ? { approvalMessageId: pending.approvalMessageId } : {})
        },
        result
      )
    }
    return conversation
  }

  const resetConversation = (): void => {
    requestGenerationRef.current += 1
    const pendingTab = pendingPlan?.tab
    setMessages((current) => ({
      ...current,
      [activeTab]: [],
      ...(pendingTab && pendingTab !== activeTab ? { [pendingTab]: [] } : {})
    }))
    chatHistoryRef.current[activeTab] = []
    if (pendingTab) chatHistoryRef.current[pendingTab] = []
    setComposerValue('')
    setSelectedFileName(null)
    setPendingPlan(null)
    setIsSending(false)
    setIsExecuting(false)
    setOpenPopup(null)
    if (textareaRef.current) textareaRef.current.style.height = ''
    textareaRef.current?.focus()
  }

  const changeExecutionMode = (mode: AgentChatMode): void => {
    if (interactionLocked || mode === executionMode) return
    requestGenerationRef.current += 1
    setExecutionMode(mode)
    writeAiExecutionMode(mode)
    setMessages({ chat: [], codex: [] })
    chatHistoryRef.current = { chat: [], codex: [] }
    setComposerValue('')
    setSelectedFileName(null)
    setAutoAttachProject(false)
    setPendingPlan(null)
    setIsSending(false)
    setIsExecuting(false)
    setOpenPopup(null)
    if (textareaRef.current) textareaRef.current.style.height = ''
  }

  const runChat = async (
    tab: AiPanelTab,
    history: AgentChatMessage[],
    generation: number
  ): Promise<void> => {
    if (!isCurrentGeneration(generation)) return
    const chatApi = window.api?.runAgentChat
    if (!chatApi) return
    if (!selectedConfigId) {
      setModelError('请选择模型')
      return
    }
    setIsSending(true)
    setModelError('')
    let conversation = history
    try {
      for (let turn = 0; turn < 6; turn += 1) {
        if (!isCurrentGeneration(generation)) return
        const requestEditorSessionId = getActiveEditorAgentApi()?.getSessionId() ?? null
        const response = await chatApi({
          configId: selectedConfigId,
          mode: executionMode,
          approvalMode,
          messages: conversation
        })
        if (!isCurrentGeneration(generation)) return
        if (!response.success || !response.assistant) {
          throw new Error(response.message || 'AI 对话失败')
        }
        const assistant = response.assistant
        conversation = [
          ...conversation,
          { role: 'assistant', content: assistant.content, toolCalls: assistant.toolCalls }
        ]
        chatHistoryRef.current[tab] = conversation
        if (assistant.content) appendMessages(tab, [createMessage('assistant', assistant.content)])
        if (assistant.toolCalls.length === 0) return

        const planCallCount = assistant.toolCalls.filter(
          (call) => call.name === 'propose_editor_plan'
        ).length
        if (planCallCount > 1) {
          for (const call of assistant.toolCalls) {
            if (!isCurrentGeneration(generation)) return
            const result =
              call.name === 'get_editor_context'
                ? executeAgentToolCall(call, getActiveEditorAgentApi(), executionMode)
                : competingPlanResult()
            conversation = continueAfterToolResult({ tab, generation, call, conversation }, result)
          }
          chatHistoryRef.current[tab] = conversation
          continue
        }

        const planCall = assistant.toolCalls.find(
          (call): call is PlanToolCall => call.name === 'propose_editor_plan'
        )
        const editorApi = getActiveEditorAgentApi()
        let planReadiness: AgentToolExecutionResult | null | undefined
        if (
          planCall &&
          decideAgentPlanApproval(executionMode, approvalMode, planCall.arguments) ===
            'require_approval'
        ) {
          planReadiness = validatePlanContext(requestEditorSessionId, editorApi, planCall.arguments)
        }
        if (planCall && planReadiness === null && requestEditorSessionId) {
          const deferredReadResults = assistant.toolCalls
            .filter((call): call is ReadToolCall => call.name === 'get_editor_context')
            .map((call) => ({
              call,
              result: executeAgentToolCall(call, editorApi, executionMode)
            }))
          const approvalMessage = createMessage('tool', planCall.arguments.summary, {
            toolName: TOOL_LABELS[planCall.name],
            success: false,
            plan: planCall.arguments,
            approvalState: 'awaiting'
          })
          appendMessages(tab, [approvalMessage])
          setPendingPlan({
            tab,
            generation,
            sourceSessionId: requestEditorSessionId,
            call: planCall,
            conversation,
            approvalMessageId: approvalMessage.id,
            toolCalls: [...assistant.toolCalls],
            deferredReadResults
          })
          return
        }

        for (const call of assistant.toolCalls) {
          if (!isCurrentGeneration(generation)) return
          const editorApi = getActiveEditorAgentApi()
          const continuation: ToolContinuation = { tab, generation, call, conversation }

          if (call.name === 'get_editor_context') {
            conversation = continueAfterToolResult(
              continuation,
              executeAgentToolCall(call, editorApi, executionMode)
            )
            continue
          }

          const decision = decideAgentPlanApproval(executionMode, approvalMode, call.arguments)
          if (decision === 'reject') {
            conversation = continueAfterToolResult(
              continuation,
              executeAgentToolCall(call, editorApi, executionMode)
            )
            continue
          }

          const readiness =
            call === planCall && planReadiness !== undefined
              ? planReadiness
              : validatePlanContext(requestEditorSessionId, editorApi, call.arguments)
          if (readiness) {
            conversation = continueAfterToolResult(continuation, readiness)
            continue
          }

          if (decision === 'auto_execute') {
            if (!isCurrentGeneration(generation)) return
            setIsExecuting(true)
            let result: AgentToolExecutionResult
            try {
              result = executeApprovedAgentPlan(call.arguments, editorApi)
            } catch (error) {
              result = executionFailedResult(error)
            }
            if (!isCurrentGeneration(generation)) return
            setIsExecuting(false)
            conversation = continueAfterToolResult(continuation, result)
            continue
          }

          throw new Error('编辑计划审批状态初始化失败')
        }
        chatHistoryRef.current[tab] = conversation
      }
      throw new Error('AI 工具调用次数过多，已停止执行')
    } catch (error) {
      if (!isCurrentGeneration(generation)) return
      appendMessages(tab, [
        createMessage('assistant', error instanceof Error ? error.message : 'AI 对话失败')
      ])
    } finally {
      if (isCurrentGeneration(generation)) {
        setIsSending(false)
        setIsExecuting(false)
      }
    }
  }

  const approvePendingPlan = (): void => {
    if (!pendingPlan || isExecuting || !isCurrentGeneration(pendingPlan.generation)) return
    const pending = pendingPlan
    updateApprovalMessage(pending.tab, pending.approvalMessageId, 'executing')
    setIsExecuting(true)
    let result: AgentToolExecutionResult = executionFailedResult(new Error('AI 编辑计划执行失败'))
    try {
      const editorApi = getActiveEditorAgentApi()
      const readiness = validatePlanContext(
        pending.sourceSessionId,
        editorApi,
        pending.call.arguments
      )
      result = readiness ?? executeApprovedAgentPlan(pending.call.arguments, editorApi)
    } catch (error) {
      result = executionFailedResult(error)
    } finally {
      if (isCurrentGeneration(pending.generation)) {
        const nextConversation = continueAfterPendingPlan(pending, result)
        setPendingPlan(null)
        setIsExecuting(false)
        void runChat(pending.tab, nextConversation, pending.generation)
      }
    }
  }

  const rejectPendingPlan = (): void => {
    if (!pendingPlan || isExecuting || !isCurrentGeneration(pendingPlan.generation)) return
    const nextConversation = continueAfterPendingPlan(pendingPlan, rejectedResult())
    const tab = pendingPlan.tab
    const generation = pendingPlan.generation
    setPendingPlan(null)
    void runChat(tab, nextConversation, generation)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const text = composerValue.trim()
    if (!text || interactionLocked) return
    if (chatAvailable && !selectedConfigId) {
      setModelError('请选择模型')
      return
    }
    setOpenPopup(null)
    const generation = requestGenerationRef.current + 1
    requestGenerationRef.current = generation

    const message = createMessage('user', text)
    const history = [
      ...chatHistoryRef.current[activeTab],
      { role: 'user', content: text } as AgentChatMessage
    ]
    chatHistoryRef.current[activeTab] = history
    appendMessages(activeTab, [message])
    setComposerValue('')
    if (textareaRef.current) textareaRef.current.style.height = ''
    void runChat(activeTab, history, generation)
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

  const focusApprovalTrigger = (): void => {
    window.setTimeout(() => approvalTriggerRef.current?.focus(), 0)
  }

  const handleApprovalMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const items = APPROVAL_OPTIONS.map((option) => approvalItemRefs.current[option.value]).filter(
      (item): item is HTMLButtonElement => item !== null
    )
    if (items.length === 0) return
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
    let nextIndex: number | null = null

    switch (event.key) {
      case 'ArrowDown':
        nextIndex = (currentIndex + 1 + items.length) % items.length
        break
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + items.length) % items.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = items.length - 1
        break
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        setOpenPopup(null)
        focusApprovalTrigger()
        return
      default:
        return
    }

    event.preventDefault()
    event.stopPropagation()
    items[nextIndex]?.focus()
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
          <button
            type="button"
            aria-label="AI 面板设置"
            title="AI 面板设置"
            onClick={onOpenSettings}
          >
            <Settings size={17} strokeWidth={1.55} aria-hidden="true" />
          </button>
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
          <div
            ref={messagesRef}
            className="studio-ai-panel__messages"
            role="log"
            aria-label="当前会话"
          >
            {activeMessages.map((message) => {
              if (message.plan) {
                const awaiting = message.approvalState === 'awaiting'
                const statusLabel =
                  message.approvalState === 'executing'
                    ? '正在执行'
                    : message.approvalState === 'completed'
                      ? '已执行'
                      : message.approvalState === 'rejected'
                        ? '已拒绝'
                        : message.approvalState === 'stale'
                          ? '计划已失效'
                          : message.approvalState === 'failed'
                            ? '执行失败'
                            : '等待批准'
                return (
                  <section
                    key={message.id}
                    className={`studio-ai-panel__approval is-${message.approvalState ?? 'awaiting'}`}
                    aria-label={`审批计划 ${message.plan.summary}`}
                  >
                    <div className="studio-ai-panel__approval-heading">
                      <ShieldCheck size={16} strokeWidth={1.7} aria-hidden="true" />
                      <div>
                        <strong>{message.plan.summary}</strong>
                        <span>{statusLabel}</span>
                      </div>
                    </div>
                    <ul>
                      {message.plan.actions.map((action, index) => (
                        <li key={`${message.plan?.planId}-${index}`}>{formatPlanAction(action)}</li>
                      ))}
                    </ul>
                    {awaiting && (
                      <div className="studio-ai-panel__approval-actions">
                        <button type="button" onClick={approvePendingPlan}>
                          批准执行
                        </button>
                        <button type="button" onClick={rejectPendingPlan}>
                          拒绝
                        </button>
                      </div>
                    )}
                  </section>
                )
              }

              if (message.role === 'tool') {
                const ToolStatusIcon = message.success ? CircleCheck : CircleAlert
                return (
                  <article
                    key={message.id}
                    className={`studio-ai-panel__message is-tool ${message.success ? 'is-success' : 'is-failure'}`}
                    data-layout="tool-result"
                  >
                    <ToolStatusIcon size={15} strokeWidth={1.8} aria-hidden="true" />
                    <div>
                      <strong>{message.toolName ?? '工具调用'}</strong>
                      <p>{message.text}</p>
                    </div>
                  </article>
                )
              }

              const copied = copiedMessageId === message.id
              return (
                <article
                  key={message.id}
                  className={`studio-ai-panel__message is-${message.role}`}
                  data-layout={message.role === 'user' ? 'bubble' : 'prose'}
                >
                  <div className="studio-ai-panel__message-body">
                    <p>{message.text}</p>
                  </div>
                  <div className="studio-ai-panel__message-meta">
                    <time>{message.createdAt}</time>
                    <button
                      type="button"
                      aria-label={copied ? '已复制' : '复制消息'}
                      title={copied ? '已复制' : '复制消息'}
                      onClick={() => void copyMessage(message)}
                    >
                      {copied ? (
                        <Check size={12} strokeWidth={1.8} aria-hidden="true" />
                      ) : (
                        <Copy size={12} strokeWidth={1.7} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </article>
              )
            })}
            {isSending && (
              <div className="studio-ai-panel__pending" role="status">
                <span aria-hidden="true" />
                <p>AI 正在处理...</p>
              </div>
            )}
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
            <select
              aria-label="执行模式"
              value={executionMode}
              disabled={interactionLocked}
              onChange={(event) => changeExecutionMode(event.target.value as AgentChatMode)}
            >
              <option value="agent">Agent</option>
              <option value="assistant">助手</option>
            </select>
          </label>
          <label className="studio-ai-panel__select" title="选择模型">
            <Cpu size={13} strokeWidth={1.7} aria-hidden="true" />
            <select
              aria-label="模型"
              value={selectedConfigId}
              onChange={(event) => {
                const configId = event.target.value
                setSelectedConfigId(configId)
                writeLastUsedAgentModelConfigId(configId)
                setModelError('')
              }}
            >
              <option value="">选择模型</option>
              {modelConfigurations.map((configuration) => (
                <option key={configuration.id} value={configuration.id}>
                  {configuration.providerName
                    ? `${configuration.providerName} / ${configuration.modelName ?? configuration.modelId}`
                    : configuration.modelId}
                </option>
              ))}
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
            disabled={
              !composerValue.trim() ||
              interactionLocked ||
              Boolean(chatAvailable && !selectedConfigId)
            }
          >
            <ArrowUp size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </form>

      {modelError && (
        <p className="studio-ai-panel__error" role="alert">
          {modelError}
        </p>
      )}

      <footer className="studio-ai-panel__statusbar">
        <span>
          <Monitor size={13} strokeWidth={1.6} aria-hidden="true" />
          本地
        </span>
        <div className="studio-ai-panel__approval-control">
          <button
            ref={approvalTriggerRef}
            className="studio-ai-panel__approval-trigger"
            type="button"
            aria-label={`审批模式：${APPROVAL_LABELS[approvalMode]}`}
            aria-haspopup="menu"
            aria-expanded={openPopup === 'approval'}
            disabled={executionMode === 'assistant' || interactionLocked}
            onClick={() => togglePopup('approval')}
          >
            <ShieldCheck size={13} strokeWidth={1.6} aria-hidden="true" />
            <span>{APPROVAL_LABELS[approvalMode]}</span>
            <ChevronDown size={11} strokeWidth={1.7} aria-hidden="true" />
          </button>
          {openPopup === 'approval' && (
            <div
              className="studio-ai-panel__approval-menu"
              role="menu"
              aria-label="审批模式"
              onKeyDown={handleApprovalMenuKeyDown}
            >
              {APPROVAL_OPTIONS.map((option) => {
                const selected = approvalMode === option.value
                const OptionIcon =
                  option.value === 'request'
                    ? CircleAlert
                    : option.value === 'smart'
                      ? ShieldCheck
                      : Bot
                return (
                  <button
                    ref={(element) => {
                      approvalItemRefs.current[option.value] = element
                    }}
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => {
                      if (interactionLocked || executionMode === 'assistant') return
                      setApprovalMode(option.value)
                      writeAiApprovalMode(option.value)
                      setOpenPopup(null)
                      focusApprovalTrigger()
                    }}
                  >
                    <OptionIcon size={16} strokeWidth={1.65} aria-hidden="true" />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                    {selected && <Check size={15} strokeWidth={1.8} aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </footer>
    </section>
  )
}

export default AiPanel
