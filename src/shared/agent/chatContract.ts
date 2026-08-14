import type {
  AgentChatMode,
  AgentChatRequest,
  AgentEditorPlan,
  AgentEditorPlanAction,
  AgentToolCall,
  AgentToolResultCode,
  AgentToolExecutionResult
} from './workflow'

const MAX_ID_LENGTH = 200
const MAX_MESSAGE_CONTENT_LENGTH = 20_000
const MAX_MESSAGES = 60
export const MAX_AGENT_TOOL_CALLS = 12
const MAX_PLAN_ACTIONS = 20
const MAX_CLIP_IDS = 100

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
): boolean {
  const keys = Object.keys(value)
  return (
    required.every((key) => key in value) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  )
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 && normalized.length <= MAX_ID_LENGTH ? normalized : null
}

function normalizeIds(value: unknown, allowEmpty = false): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_CLIP_IDS || (!allowEmpty && value.length === 0)) {
    return null
  }
  const normalized = value.map(normalizeId)
  if (normalized.some((id) => id === null)) return null
  return [...new Set(normalized as string[])]
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

type PlanTransform = NonNullable<
  Extract<AgentEditorPlanAction, { type: 'clip.update' }>['patch']['transform']
>

function normalizeTransform(value: unknown): PlanTransform | null {
  if (!isRecord(value)) return null
  if (!hasExactKeys(value, [], ['x', 'y', 'scaleX', 'scaleY', 'rotation'])) return null
  if (Object.keys(value).length === 0) return null
  if (value.x !== undefined && !isFiniteInRange(value.x, -100_000, 100_000)) return null
  if (value.y !== undefined && !isFiniteInRange(value.y, -100_000, 100_000)) return null
  if (value.scaleX !== undefined && !isFiniteInRange(value.scaleX, 0.01, 100)) return null
  if (value.scaleY !== undefined && !isFiniteInRange(value.scaleY, 0.01, 100)) return null
  if (value.rotation !== undefined && !isFiniteInRange(value.rotation, -36_000, 36_000)) {
    return null
  }
  const transform: PlanTransform = {}
  if (value.x !== undefined) transform.x = value.x as number
  if (value.y !== undefined) transform.y = value.y as number
  if (value.scaleX !== undefined) transform.scaleX = value.scaleX as number
  if (value.scaleY !== undefined) transform.scaleY = value.scaleY as number
  if (value.rotation !== undefined) transform.rotation = value.rotation as number
  return transform
}

function normalizeAction(value: unknown): AgentEditorPlanAction | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null
  if (value.type === 'clip.delete') {
    if (!hasExactKeys(value, ['type', 'clipIds'], ['magnetMainTrack'])) return null
    const clipIds = normalizeIds(value.clipIds)
    if (
      !clipIds ||
      (value.magnetMainTrack !== undefined && typeof value.magnetMainTrack !== 'boolean')
    ) {
      return null
    }
    return value.magnetMainTrack === undefined
      ? { type: 'clip.delete', clipIds }
      : { type: 'clip.delete', clipIds, magnetMainTrack: value.magnetMainTrack }
  }
  const clipId = normalizeId(value.clipId)
  if (!clipId) return null
  if (value.type === 'clip.split') {
    if (!hasExactKeys(value, ['type', 'clipId', 'at']) || !isFiniteInRange(value.at, 0, 86_400)) {
      return null
    }
    return { type: 'clip.split', clipId, at: value.at }
  }
  if (value.type === 'clip.move') {
    if (!hasExactKeys(value, ['type', 'clipId', 'timelineStart'], ['trackId'])) return null
    if (!isFiniteInRange(value.timelineStart, 0, 86_400)) return null
    const trackId = value.trackId === undefined ? undefined : normalizeId(value.trackId)
    if (value.trackId !== undefined && !trackId) return null
    return trackId
      ? { type: 'clip.move', clipId, timelineStart: value.timelineStart, trackId }
      : { type: 'clip.move', clipId, timelineStart: value.timelineStart }
  }
  if (
    value.type !== 'clip.update' ||
    !hasExactKeys(value, ['type', 'clipId', 'patch']) ||
    !isRecord(value.patch)
  ) {
    return null
  }
  const patch = value.patch
  if (
    !hasExactKeys(patch, [], ['opacity', 'volume', 'muted', 'speed', 'enabled', 'transform']) ||
    Object.keys(patch).length === 0
  ) {
    return null
  }
  if (patch.opacity !== undefined && !isFiniteInRange(patch.opacity, 0, 1)) return null
  if (patch.volume !== undefined && !isFiniteInRange(patch.volume, 0, 1)) return null
  if (patch.speed !== undefined && !isFiniteInRange(patch.speed, 0.1, 8)) return null
  if (patch.muted !== undefined && typeof patch.muted !== 'boolean') return null
  if (patch.enabled !== undefined && typeof patch.enabled !== 'boolean') return null
  const transform = patch.transform === undefined ? undefined : normalizeTransform(patch.transform)
  if (patch.transform !== undefined && !transform) return null
  const normalizedPatch: Extract<AgentEditorPlanAction, { type: 'clip.update' }>['patch'] = {}
  if (patch.opacity !== undefined) normalizedPatch.opacity = patch.opacity as number
  if (patch.volume !== undefined) normalizedPatch.volume = patch.volume as number
  if (patch.muted !== undefined) normalizedPatch.muted = patch.muted as boolean
  if (patch.speed !== undefined) normalizedPatch.speed = patch.speed as number
  if (patch.enabled !== undefined) normalizedPatch.enabled = patch.enabled as boolean
  if (transform) normalizedPatch.transform = transform
  return { type: 'clip.update', clipId, patch: normalizedPatch }
}

function normalizePlan(value: unknown): AgentEditorPlan | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['planId', 'projectRevision', 'summary', 'actions'])
  ) {
    return null
  }
  const planId = normalizeId(value.planId)
  if (
    !planId ||
    !Number.isSafeInteger(value.projectRevision) ||
    (value.projectRevision as number) < 0
  ) {
    return null
  }
  if (typeof value.summary !== 'string') return null
  const summary = value.summary.trim()
  if (summary.length === 0 || summary.length > 2_000) return null
  if (
    !Array.isArray(value.actions) ||
    value.actions.length === 0 ||
    value.actions.length > MAX_PLAN_ACTIONS
  ) {
    return null
  }
  const actions = value.actions.map(normalizeAction)
  if (actions.some((action) => action === null)) return null
  return {
    planId,
    projectRevision: value.projectRevision as number,
    summary,
    actions: actions as AgentEditorPlanAction[]
  }
}

export function parseAgentToolCall(mode: AgentChatMode, value: unknown): AgentToolCall {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'name', 'arguments'])) {
    throw new Error('Invalid Agent tool call')
  }
  const id = normalizeId(value.id)
  if (!id || !isRecord(value.arguments)) throw new Error('Invalid Agent tool call')
  if (value.name === 'get_editor_context') {
    if (Object.keys(value.arguments).length !== 0) throw new Error('Invalid Agent tool call')
    return { id, name: 'get_editor_context', arguments: {} }
  }
  if (value.name !== 'propose_editor_plan') {
    throw new Error(`Unsupported Agent tool: ${String(value.name)}`)
  }
  if (mode !== 'agent') throw new Error('Editor plans are not allowed in assistant mode')
  const plan = normalizePlan(value.arguments)
  if (!plan) throw new Error('Invalid Agent editor plan')
  return { id, name: 'propose_editor_plan', arguments: plan }
}

const executionCodes = new Set<AgentToolResultCode>([
  'OK',
  'AWAITING_APPROVAL',
  'REJECTED',
  'STALE_CONTEXT',
  'INVALID_PLAN',
  'UNSUPPORTED_ACTION',
  'EDITOR_UNAVAILABLE',
  'EXECUTION_FAILED'
])

export function isAgentToolExecutionResult(value: unknown): value is AgentToolExecutionResult {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['success', 'code', 'message', 'changed', 'affectedClipIds'], ['data'])
  ) {
    return false
  }
  if (typeof value.success !== 'boolean' || typeof value.changed !== 'boolean') return false
  if (typeof value.code !== 'string' || !executionCodes.has(value.code as AgentToolResultCode)) {
    return false
  }
  if (typeof value.message !== 'string' || value.message.length > MAX_MESSAGE_CONTENT_LENGTH) {
    return false
  }
  return normalizeIds(value.affectedClipIds, true) !== null
}

function isMessage(mode: AgentChatMode, value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.content !== 'string' ||
    value.content.length > MAX_MESSAGE_CONTENT_LENGTH
  ) {
    return false
  }
  if (value.role === 'user') return hasExactKeys(value, ['role', 'content'])
  if (value.role === 'assistant') {
    if (!hasExactKeys(value, ['role', 'content'], ['toolCalls'])) return false
    if (value.toolCalls === undefined) return true
    if (!Array.isArray(value.toolCalls)) return false
    if (value.toolCalls.length > MAX_AGENT_TOOL_CALLS) return false
    try {
      value.toolCalls.forEach((call) => parseAgentToolCall(mode, call))
      return true
    } catch {
      return false
    }
  }
  if (value.role !== 'tool' || !hasExactKeys(value, ['role', 'content', 'toolCallId', 'name'])) {
    return false
  }
  if (
    !normalizeId(value.toolCallId) ||
    (value.name !== 'get_editor_context' && value.name !== 'propose_editor_plan')
  ) {
    return false
  }
  if (mode === 'assistant' && value.name === 'propose_editor_plan') return false
  try {
    return isAgentToolExecutionResult(JSON.parse(value.content))
  } catch {
    return false
  }
}

export function isAgentChatRequest(value: unknown): value is AgentChatRequest {
  if (!isRecord(value) || !hasExactKeys(value, ['configId', 'mode', 'approvalMode', 'messages'])) {
    return false
  }
  if (!normalizeId(value.configId) || (value.mode !== 'agent' && value.mode !== 'assistant')) {
    return false
  }
  if (
    value.approvalMode !== 'request' &&
    value.approvalMode !== 'smart' &&
    value.approvalMode !== 'full'
  ) {
    return false
  }
  if (
    !Array.isArray(value.messages) ||
    value.messages.length === 0 ||
    value.messages.length > MAX_MESSAGES
  ) {
    return false
  }
  const pendingCalls = new Map<string, AgentToolCall['name']>()
  for (const message of value.messages) {
    if (!isMessage(value.mode as AgentChatMode, message)) return false
    if (isRecord(message) && message.role === 'assistant' && Array.isArray(message.toolCalls)) {
      for (const call of message.toolCalls) {
        let parsed: AgentToolCall
        try {
          parsed = parseAgentToolCall(value.mode as AgentChatMode, call)
        } catch {
          return false
        }
        if (pendingCalls.has(parsed.id)) return false
        pendingCalls.set(parsed.id, parsed.name)
      }
    }
    if (isRecord(message) && message.role === 'tool') {
      const toolCallId = normalizeId(message.toolCallId)
      if (!toolCallId || pendingCalls.get(toolCallId) !== message.name) return false
      pendingCalls.delete(toolCallId)
    }
  }
  return pendingCalls.size === 0
}
