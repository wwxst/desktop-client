import { mkdir } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type {
  CodexActionResponse,
  CodexApprovalKind,
  CodexApprovalResponseRequest,
  CodexEvent,
  CodexInterruptTurnRequest,
  CodexModelListResponse,
  CodexModelSummary,
  CodexResumeThreadRequest,
  CodexStartThreadRequest,
  CodexStartTurnRequest,
  CodexStatusResponse,
  CodexThreadListResponse,
  CodexThreadResponse,
  CodexThreadSummary,
  CodexTurnResponse
} from '../../shared/codex'
import {
  CodexAppServerClient,
  type CodexServerNotification,
  type CodexServerRequest
} from './CodexAppServerClient'

type JsonRecord = Record<string, unknown>

interface PendingApproval {
  serverRequestId: string | number
  kind: CodexApprovalKind
  response:
    | { type: 'decision' }
    | {
        type: 'user-input'
        questionId: string
        acceptLabel: string
        declineLabel: string
      }
}

export interface CodexServiceOptions {
  client?: CodexAppServerClient
  workspaceDirectory: string
}

const VIDEO_AGENT_INSTRUCTIONS = [
  'You are the general conversation foundation for a desktop video-editing Agent client.',
  'Jianying 5.9 tools may inspect real drafts but real drafts are always read-only.',
  'Controlled writes are allowed only in application-managed working copies and require prepare, preview, explicit user approval, apply, and verification or rollback.',
  'Jianying automatic update and silent upgrade are denied by default and must never be enabled.',
  'No Jianying launch, desktop-control, real-draft write, or export tool is connected. Never claim those actions were completed.',
  'Do not modify files unless the user explicitly requests it and the host approves the operation.'
].join(' ')

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function truncate(value: string, maxLength = 500): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`
}

function matchesApprovalOption(label: string, kind: 'accept' | 'decline'): boolean {
  const normalized = label.trim().toLowerCase()
  const declinePattern =
    /(decline|deny|reject|cancel|disallow|refuse|no|拒绝|取消|不同意|不允许|否)/
  if (kind === 'decline') return declinePattern.test(normalized)
  if (declinePattern.test(normalized)) return false
  return /(accept|allow|approve|confirm|proceed|yes|允许|同意|批准|确认|继续|是)/.test(normalized)
}

function parseMcpApprovalQuestion(params: JsonRecord): {
  questionId: string
  acceptLabel: string
  declineLabel: string
  summary: string
  reason?: string
} | null {
  if (!Array.isArray(params.questions) || params.questions.length !== 1) return null
  const question = params.questions[0]
  if (!isRecord(question) || question.isSecret === true || !Array.isArray(question.options)) {
    return null
  }
  const questionId = readString(question.id)
  const prompt = readString(question.question)
  if (!questionId || !prompt) return null
  const labels = question.options.flatMap((option) => {
    if (!isRecord(option)) return []
    const label = readString(option.label)
    return label ? [label] : []
  })
  const acceptLabel = labels.find((label) => matchesApprovalOption(label, 'accept'))
  const declineLabel = labels.find((label) => matchesApprovalOption(label, 'decline'))
  if (!acceptLabel || !declineLabel || acceptLabel === declineLabel) return null
  return {
    questionId,
    acceptLabel,
    declineLabel,
    summary: truncate(readString(question.header) ?? '剪映工具操作'),
    reason: truncate(prompt)
  }
}

function toThreadSummary(value: unknown): CodexThreadSummary | null {
  if (!isRecord(value)) return null
  const id = readString(value.id)
  const modelProvider = readString(value.modelProvider)
  const createdAt = readNumber(value.createdAt)
  const updatedAt = readNumber(value.updatedAt)
  if (!id || !modelProvider || createdAt === undefined || updatedAt === undefined) return null
  return {
    id,
    preview: readString(value.preview) ?? '',
    name: value.name === null ? null : (readString(value.name) ?? null),
    modelProvider,
    createdAt,
    updatedAt
  }
}

function toModelSummary(value: unknown): CodexModelSummary | null {
  if (!isRecord(value)) return null
  const id = readString(value.id)
  const model = readString(value.model)
  const displayName = readString(value.displayName)
  if (!id || !model || !displayName) return null
  return {
    id,
    model,
    displayName,
    description: readString(value.description) ?? '',
    isDefault: value.isDefault === true
  }
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function isPathInside(parent: string, candidate: string): boolean {
  const path = relative(resolve(parent), resolve(candidate))
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

export class CodexService {
  private readonly client: CodexAppServerClient
  private readonly workspaceDirectory: string
  private readonly listeners = new Set<(event: CodexEvent) => void>()
  private readonly pendingApprovals = new Map<string, PendingApproval>()
  private nextApprovalId = 1
  private readyPromise: Promise<void> | null = null

  constructor(options: CodexServiceOptions) {
    this.client = options.client ?? new CodexAppServerClient()
    this.workspaceDirectory = resolve(options.workspaceDirectory)
    this.client.onNotification((event) => this.handleNotification(event))
    this.client.onRequest((request) => this.handleServerRequest(request))
    this.client.onStatus((connected, message) => {
      this.emit({ type: 'status-changed', connected, message })
      if (!connected) {
        this.readyPromise = null
        this.pendingApprovals.clear()
      }
    })
  }

  onEvent(listener: (event: CodexEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async getStatus(): Promise<CodexStatusResponse> {
    try {
      await this.ensureReady()
      return {
        success: true,
        connected: true,
        message: 'Codex App Server 已连接',
        userAgent: this.client.initializedUserAgent
      }
    } catch (error) {
      return {
        success: false,
        connected: false,
        message: errorText(error, 'Codex App Server 连接失败')
      }
    }
  }

  async listModels(): Promise<CodexModelListResponse> {
    try {
      const result = await this.request('model/list', { includeHidden: false })
      const models =
        isRecord(result) && Array.isArray(result.data)
          ? result.data
              .map(toModelSummary)
              .filter((model): model is CodexModelSummary => model !== null)
          : []
      return { success: true, message: 'Codex 模型加载成功', models }
    } catch (error) {
      return { success: false, message: errorText(error, 'Codex 模型加载失败'), models: [] }
    }
  }

  async listThreads(): Promise<CodexThreadListResponse> {
    try {
      const result = await this.request('thread/list', {
        limit: 100,
        sourceKinds: ['appServer'],
        archived: false,
        cwd: this.workspaceDirectory
      })
      const threads =
        isRecord(result) && Array.isArray(result.data)
          ? result.data
              .map(toThreadSummary)
              .filter((thread): thread is CodexThreadSummary => thread !== null)
          : []
      return { success: true, message: 'Codex 对话加载成功', threads }
    } catch (error) {
      return { success: false, message: errorText(error, 'Codex 对话加载失败'), threads: [] }
    }
  }

  async startThread(request: CodexStartThreadRequest): Promise<CodexThreadResponse> {
    try {
      const result = await this.request('thread/start', {
        model: request.model ?? null,
        cwd: this.workspaceDirectory,
        approvalPolicy: 'on-request',
        approvalsReviewer: 'user',
        sandbox: 'read-only',
        developerInstructions: VIDEO_AGENT_INSTRUCTIONS,
        threadSource: 'user'
      })
      const response = isRecord(result) ? result : null
      const thread = response ? toThreadSummary(response.thread) : null
      if (!thread) throw new Error('Codex 未返回有效的对话线程')
      return {
        success: true,
        message: 'Codex 对话已创建',
        thread,
        model: readString(response?.model)
      }
    } catch (error) {
      return { success: false, message: errorText(error, 'Codex 对话创建失败') }
    }
  }

  async resumeThread(request: CodexResumeThreadRequest): Promise<CodexThreadResponse> {
    try {
      const result = await this.request('thread/resume', {
        threadId: request.threadId,
        cwd: this.workspaceDirectory,
        approvalPolicy: 'on-request',
        approvalsReviewer: 'user',
        sandbox: 'read-only',
        developerInstructions: VIDEO_AGENT_INSTRUCTIONS
      })
      const response = isRecord(result) ? result : null
      const thread = response ? toThreadSummary(response.thread) : null
      if (!thread) throw new Error('Codex 未返回有效的对话线程')
      return {
        success: true,
        message: 'Codex 对话已恢复',
        thread,
        model: readString(response?.model)
      }
    } catch (error) {
      return { success: false, message: errorText(error, 'Codex 对话恢复失败') }
    }
  }

  async startTurn(request: CodexStartTurnRequest): Promise<CodexTurnResponse> {
    try {
      const result = await this.request('turn/start', {
        threadId: request.threadId,
        input: [{ type: 'text', text: request.text, text_elements: [] }],
        approvalPolicy: 'on-request',
        approvalsReviewer: 'user'
      })
      const turn = isRecord(result) && isRecord(result.turn) ? result.turn : null
      const turnId = turn ? readString(turn.id) : undefined
      if (!turnId) throw new Error('Codex 未返回有效的 Turn')
      return {
        success: true,
        message: 'Codex Turn 已开始',
        threadId: request.threadId,
        turnId
      }
    } catch (error) {
      return { success: false, message: errorText(error, 'Codex Turn 启动失败') }
    }
  }

  async interruptTurn(request: CodexInterruptTurnRequest): Promise<CodexActionResponse> {
    try {
      await this.request('turn/interrupt', request)
      return { success: true, message: 'Codex Turn 取消指令已发送' }
    } catch (error) {
      return { success: false, message: errorText(error, 'Codex Turn 取消失败') }
    }
  }

  respondApproval(request: CodexApprovalResponseRequest): CodexActionResponse {
    const pending = this.pendingApprovals.get(request.requestId)
    if (!pending) return { success: false, message: '审批请求不存在或已经处理' }
    this.pendingApprovals.delete(request.requestId)
    if (pending.response.type === 'decision') {
      this.client.respond(pending.serverRequestId, { decision: request.decision })
    } else {
      const label =
        request.decision === 'accept' ? pending.response.acceptLabel : pending.response.declineLabel
      this.client.respond(pending.serverRequestId, {
        answers: {
          [pending.response.questionId]: { answers: [label] }
        }
      })
    }
    return {
      success: true,
      message: request.decision === 'accept' ? '已允许本次操作' : '已拒绝本次操作'
    }
  }

  stop(): void {
    this.client.stop()
    this.pendingApprovals.clear()
    this.readyPromise = null
  }

  private ensureReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = mkdir(this.workspaceDirectory, { recursive: true })
        .then(() => this.client.start())
        .catch((error) => {
          this.readyPromise = null
          throw error
        })
    }
    return this.readyPromise
  }

  private async request(method: string, params?: unknown): Promise<unknown> {
    await this.ensureReady()
    return this.client.request(method, params)
  }

  private handleNotification(event: CodexServerNotification): void {
    const params = isRecord(event.params) ? event.params : null
    if (!params) return
    const threadId = readString(params.threadId)

    if (event.method === 'item/agentMessage/delta') {
      const turnId = readString(params.turnId)
      const itemId = readString(params.itemId)
      const delta = readString(params.delta)
      if (threadId && turnId && itemId && delta) {
        this.emit({ type: 'message-delta', threadId, turnId, itemId, delta })
      }
      return
    }

    if (event.method === 'turn/started' && threadId && isRecord(params.turn)) {
      const turnId = readString(params.turn.id)
      if (turnId) this.emit({ type: 'turn-started', threadId, turnId })
      return
    }

    if (event.method === 'turn/completed' && threadId && isRecord(params.turn)) {
      const turnId = readString(params.turn.id)
      const rawStatus = readString(params.turn.status)
      const status = rawStatus === 'interrupted' || rawStatus === 'failed' ? rawStatus : 'completed'
      const turnError = isRecord(params.turn.error)
        ? readString(params.turn.error.message)
        : undefined
      if (turnId) this.emit({ type: 'turn-completed', threadId, turnId, status, error: turnError })
      return
    }

    if (event.method === 'error') {
      this.emit({
        type: 'error',
        message: readString(params.message) ?? 'Codex 执行失败',
        threadId,
        turnId: readString(params.turnId)
      })
    }
  }

  private handleServerRequest(request: CodexServerRequest): void {
    const params = isRecord(request.params) ? request.params : null
    if (!params) {
      this.client.respondError(request.id, '无效的 Codex Server 请求')
      return
    }
    const threadId = readString(params.threadId)
    const turnId = readString(params.turnId)
    if (!threadId || !turnId) {
      this.client.respondError(request.id, 'Codex Server 请求缺少线程信息')
      return
    }

    let kind: CodexApprovalKind
    let summary: string
    let reason = readString(params.reason)
    let response: PendingApproval['response'] = { type: 'decision' }
    if (request.method === 'item/commandExecution/requestApproval') {
      kind = 'command'
      summary = truncate(readString(params.command) ?? '执行命令')
      const cwd = readString(params.cwd)
      if (cwd && !isPathInside(this.workspaceDirectory, cwd)) {
        this.client.respond(request.id, { decision: 'decline' })
        this.emit({ type: 'error', threadId, turnId, message: '已拒绝工作目录之外的命令请求' })
        return
      }
    } else if (request.method === 'item/fileChange/requestApproval') {
      kind = 'file-change'
      summary = '修改 Codex 专用工作目录中的文件'
      const grantRoot = readString(params.grantRoot)
      if (grantRoot && !isPathInside(this.workspaceDirectory, grantRoot)) {
        this.client.respond(request.id, { decision: 'decline' })
        this.emit({ type: 'error', threadId, turnId, message: '已拒绝工作目录之外的文件修改请求' })
        return
      }
    } else if (request.method === 'item/tool/requestUserInput') {
      const approval = parseMcpApprovalQuestion(params)
      if (!approval) {
        this.client.respondError(request.id, '暂不支持非审批型或敏感的工具问题')
        return
      }
      kind = 'mcp-tool'
      summary = approval.summary
      reason = approval.reason
      response = {
        type: 'user-input',
        questionId: approval.questionId,
        acceptLabel: approval.acceptLabel,
        declineLabel: approval.declineLabel
      }
    } else {
      this.client.respondError(request.id, `暂不支持 Codex Server 请求：${request.method}`)
      return
    }

    const requestId = `approval-${this.nextApprovalId}`
    this.nextApprovalId += 1
    this.pendingApprovals.set(requestId, { serverRequestId: request.id, kind, response })
    this.emit({
      type: 'approval-requested',
      approval: {
        requestId,
        threadId,
        turnId,
        kind,
        summary,
        reason,
        cwd: readString(params.cwd)
      }
    })
  }

  private emit(event: CodexEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}
