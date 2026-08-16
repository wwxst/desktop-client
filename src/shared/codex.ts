export type CodexPermissionMode = 'request' | 'smart' | 'full'

export interface CodexActionResponse {
  success: boolean
  message: string
}

export interface CodexStatusResponse extends CodexActionResponse {
  connected: boolean
  userAgent?: string
}

export interface CodexModelSummary {
  id: string
  model: string
  displayName: string
  description: string
  isDefault: boolean
}

export interface CodexModelListResponse extends CodexActionResponse {
  models: CodexModelSummary[]
}

export interface CodexThreadSummary {
  id: string
  preview: string
  name: string | null
  modelProvider: string
  createdAt: number
  updatedAt: number
}

export interface CodexThreadListResponse extends CodexActionResponse {
  threads: CodexThreadSummary[]
}

export interface CodexStartThreadRequest {
  model?: string
  permissionMode: CodexPermissionMode
}

export interface CodexResumeThreadRequest {
  threadId: string
  permissionMode: CodexPermissionMode
}

export interface CodexThreadResponse extends CodexActionResponse {
  thread?: CodexThreadSummary
  model?: string
}

export interface CodexStartTurnRequest {
  threadId: string
  text: string
  permissionMode: CodexPermissionMode
}

export interface CodexTurnResponse extends CodexActionResponse {
  threadId?: string
  turnId?: string
}

export interface CodexInterruptTurnRequest {
  threadId: string
  turnId: string
}

export type CodexApprovalKind = 'command' | 'file-change' | 'mcp-tool'

export interface CodexApprovalRequest {
  requestId: string
  threadId: string
  turnId: string
  kind: CodexApprovalKind
  summary: string
  reason?: string
  cwd?: string
}

export interface CodexApprovalResponseRequest {
  requestId: string
  decision: 'accept' | 'decline'
}

export type CodexEvent =
  | {
      type: 'status-changed'
      connected: boolean
      message: string
    }
  | {
      type: 'turn-started'
      threadId: string
      turnId: string
    }
  | {
      type: 'message-delta'
      threadId: string
      turnId: string
      itemId: string
      delta: string
    }
  | {
      type: 'turn-completed'
      threadId: string
      turnId: string
      status: 'completed' | 'interrupted' | 'failed'
      error?: string
    }
  | {
      type: 'approval-requested'
      approval: CodexApprovalRequest
    }
  | {
      type: 'error'
      message: string
      threadId?: string
      turnId?: string
    }

const MAX_ID_LENGTH = 300
const MAX_MODEL_LENGTH = 200
const MAX_TURN_TEXT_LENGTH = 20_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function isPermissionMode(value: unknown): value is CodexPermissionMode {
  return value === 'request' || value === 'smart' || value === 'full'
}

export function isCodexStartThreadRequest(value: unknown): value is CodexStartThreadRequest {
  if (!isRecord(value) || !hasOnlyKeys(value, ['model', 'permissionMode'])) return false
  return (
    isPermissionMode(value.permissionMode) &&
    (value.model === undefined || isNonEmptyString(value.model, MAX_MODEL_LENGTH))
  )
}

export function isCodexResumeThreadRequest(value: unknown): value is CodexResumeThreadRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['threadId', 'permissionMode']) &&
    isNonEmptyString(value.threadId, MAX_ID_LENGTH) &&
    isPermissionMode(value.permissionMode)
  )
}

export function isCodexStartTurnRequest(value: unknown): value is CodexStartTurnRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['threadId', 'text', 'permissionMode']) &&
    isNonEmptyString(value.threadId, MAX_ID_LENGTH) &&
    isNonEmptyString(value.text, MAX_TURN_TEXT_LENGTH) &&
    isPermissionMode(value.permissionMode)
  )
}

export function isCodexInterruptTurnRequest(value: unknown): value is CodexInterruptTurnRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['threadId', 'turnId']) &&
    isNonEmptyString(value.threadId, MAX_ID_LENGTH) &&
    isNonEmptyString(value.turnId, MAX_ID_LENGTH)
  )
}

export function isCodexApprovalResponseRequest(
  value: unknown
): value is CodexApprovalResponseRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['requestId', 'decision']) &&
    isNonEmptyString(value.requestId, MAX_ID_LENGTH) &&
    (value.decision === 'accept' || value.decision === 'decline')
  )
}
