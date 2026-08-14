import type {
  AgentEditorPlan,
  AgentEditorPlanAction,
  AgentToolExecutionResult,
  AgentToolResultCode
} from '../../../../shared/agent/workflow'
import {
  applyEditorTransactionWithResult,
  type ClipPatch,
  type EditorCommand
} from '../SmartEdit/VideoEditorWorkspace/editorCommands'
import type { EditorAgentApi } from '../SmartEdit/VideoEditorWorkspace/editorAgentApi'
import type { EditorProjectState } from '../SmartEdit/VideoEditorWorkspace/editorProject'
import {
  createDefaultEditorIdFactory,
  planDeleteClips,
  planMoveClips,
  type EditorIdFactory
} from '../SmartEdit/VideoEditorWorkspace/core/editorPlacementPolicy'

export interface CompiledAgentEditorPlan {
  commands: EditorCommand[]
  affectedClipIds: string[]
}

type CompilationFailureCode = Extract<AgentToolResultCode, 'INVALID_PLAN' | 'UNSUPPORTED_ACTION'>

export type AgentEditorPlanCompilationResult =
  | { success: true; compiled: CompiledAgentEditorPlan }
  | { success: false; code: CompilationFailureCode; message: string }

const UPDATE_PATCH_KEYS = ['opacity', 'volume', 'muted', 'speed', 'enabled', 'transform'] as const
const TRANSFORM_KEYS = ['x', 'y', 'scaleX', 'scaleY', 'rotation'] as const

export function compileAgentEditorPlan(
  project: EditorProjectState,
  plan: AgentEditorPlan,
  ids: Pick<EditorIdFactory, 'clip'> = createDefaultEditorIdFactory()
): AgentEditorPlanCompilationResult {
  if (!Array.isArray(plan.actions) || plan.actions.length === 0) {
    return invalidPlan('编辑计划没有可执行动作')
  }

  let simulated = project
  const commands: EditorCommand[] = []
  const affectedClipIds: string[] = []
  const affectedSet = new Set<string>()
  const defaultIds = createDefaultEditorIdFactory()
  const editorIds: EditorIdFactory = { ...defaultIds, clip: ids.clip }

  for (const action of plan.actions as readonly AgentEditorPlanAction[]) {
    const step = compileAction(simulated, action, editorIds)
    if (!step.success) return step

    const simulation = applyEditorTransactionWithResult(simulated, step.commands)
    if (!simulation.success || !simulation.changed) {
      return invalidPlan(simulation.message ?? '编辑动作预检失败')
    }

    commands.push(...step.commands)
    for (const clipId of affectedIdsForCommands(step.commands)) {
      if (affectedSet.has(clipId)) continue
      affectedSet.add(clipId)
      affectedClipIds.push(clipId)
    }
    simulated = simulation.state
  }

  if (commands.length === 0) return invalidPlan('编辑计划没有生成命令')
  return { success: true, compiled: { commands, affectedClipIds } }
}

export function executeAgentEditorPlan(
  plan: AgentEditorPlan,
  editorApi: EditorAgentApi
): AgentToolExecutionResult {
  if (editorApi.getRevision() !== plan.projectRevision) return staleContext()

  const compilation = compileAgentEditorPlan(editorApi.getProjectSnapshot(), plan)
  if (!compilation.success) {
    return {
      success: false,
      code: compilation.code,
      message: compilation.message,
      changed: false,
      affectedClipIds: []
    }
  }

  if (editorApi.getRevision() !== plan.projectRevision) return staleContext()

  const result = editorApi.executeTransaction(compilation.compiled.commands, `AI：${plan.summary}`)
  if (!result.success || !result.changed) {
    return {
      success: false,
      code: 'EXECUTION_FAILED',
      message: result.message ?? 'AI 编辑计划执行失败',
      changed: false,
      affectedClipIds: []
    }
  }

  return {
    success: true,
    code: 'OK',
    message: `已执行编辑计划：${plan.summary}`,
    changed: true,
    affectedClipIds: compilation.compiled.affectedClipIds
  }
}

function compileAction(
  project: EditorProjectState,
  action: AgentEditorPlanAction,
  ids: EditorIdFactory
):
  | { success: true; commands: EditorCommand[] }
  | { success: false; code: CompilationFailureCode; message: string } {
  if (!isRecord(action) || typeof action.type !== 'string') {
    return unsupportedAction('计划包含不支持的编辑动作')
  }

  switch (action.type) {
    case 'clip.delete': {
      if (
        !Array.isArray(action.clipIds) ||
        action.clipIds.length === 0 ||
        action.clipIds.some((clipId) => !hasClip(project, clipId))
      ) {
        return invalidPlan('删除动作包含不存在的片段')
      }
      const planned = planDeleteClips(project, action.clipIds, {
        magnetMainTrack: action.magnetMainTrack
      })
      return planned.changed && planned.commands.length > 0
        ? { success: true, commands: planned.commands }
        : invalidPlan(planned.reason ?? '删除动作没有生成命令')
    }

    case 'clip.move': {
      if (!hasClip(project, action.clipId)) return invalidPlan('移动目标片段不存在')
      if (!isFiniteInRange(action.timelineStart, 0, 86_400)) {
        return invalidPlan('移动时间超出允许范围')
      }
      if (
        action.trackId !== undefined &&
        !project.tracks.some((track) => track.id === action.trackId)
      ) {
        return invalidPlan('移动目标轨道不存在')
      }

      const directCommand: EditorCommand = {
        type: 'clip/move',
        clipId: action.clipId,
        timelineStart: action.timelineStart,
        ...(action.trackId === undefined ? {} : { trackId: action.trackId })
      }
      const directPreflight = applyEditorTransactionWithResult(project, [directCommand])
      if (!directPreflight.success || !directPreflight.changed) {
        return invalidPlan(directPreflight.message ?? '移动动作预检失败')
      }

      const planned = planMoveClips(project, [action], ids)
      return planned.changed && planned.commands.length > 0
        ? { success: true, commands: planned.commands }
        : invalidPlan(planned.reason ?? '移动动作没有生成命令')
    }

    case 'clip.split': {
      if (!hasClip(project, action.clipId)) return invalidPlan('分割目标片段不存在')
      if (!isFiniteInRange(action.at, 0, 86_400)) return invalidPlan('分割时间超出允许范围')
      return {
        success: true,
        commands: [
          { type: 'clip/split', clipId: action.clipId, at: action.at, rightClipId: ids.clip() }
        ]
      }
    }

    case 'clip.update': {
      if (!hasClip(project, action.clipId)) return invalidPlan('参数修改目标片段不存在')
      if (!isValidUpdatePatch(action.patch)) return invalidPlan('片段参数为空或超出允许范围')
      return {
        success: true,
        commands: [{ type: 'clip/update', clipId: action.clipId, patch: action.patch as ClipPatch }]
      }
    }

    default:
      return unsupportedAction(
        `不支持的编辑动作：${String((action as unknown as { type?: unknown }).type)}`
      )
  }
}

function isValidUpdatePatch(value: unknown): value is ClipPatch {
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  if (keys.length === 0 || keys.some((key) => !UPDATE_PATCH_KEYS.includes(key as never))) {
    return false
  }
  if (value.opacity !== undefined && !isFiniteInRange(value.opacity, 0, 1)) return false
  if (value.volume !== undefined && !isFiniteInRange(value.volume, 0, 1)) return false
  if (value.speed !== undefined && !isFiniteInRange(value.speed, 0.1, 8)) return false
  if (value.muted !== undefined && typeof value.muted !== 'boolean') return false
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') return false
  if (value.transform === undefined) return true
  if (!isRecord(value.transform)) return false
  const transformKeys = Object.keys(value.transform)
  if (
    transformKeys.length === 0 ||
    transformKeys.some((key) => !TRANSFORM_KEYS.includes(key as never))
  ) {
    return false
  }
  if (value.transform.x !== undefined && !isFiniteInRange(value.transform.x, -100_000, 100_000)) {
    return false
  }
  if (value.transform.y !== undefined && !isFiniteInRange(value.transform.y, -100_000, 100_000)) {
    return false
  }
  if (value.transform.scaleX !== undefined && !isFiniteInRange(value.transform.scaleX, 0.01, 100)) {
    return false
  }
  if (value.transform.scaleY !== undefined && !isFiniteInRange(value.transform.scaleY, 0.01, 100)) {
    return false
  }
  return (
    value.transform.rotation === undefined ||
    isFiniteInRange(value.transform.rotation, -36_000, 36_000)
  )
}

function affectedIdsForCommands(commands: readonly EditorCommand[]): string[] {
  const affected: string[] = []
  for (const command of commands) {
    switch (command.type) {
      case 'clip/delete':
      case 'clip/move':
      case 'clip/trim':
      case 'clip/update':
        affected.push(command.clipId)
        break
      case 'clip/split':
        affected.push(command.clipId, command.rightClipId)
        break
      case 'clip/addAsset':
        affected.push(command.clipId)
        break
      case 'clip/add':
        affected.push(command.clip.id)
        break
      case 'clip/duplicate':
        affected.push(command.clipId, command.newClipId)
        break
      default:
        break
    }
  }
  return affected
}

function hasClip(project: EditorProjectState, clipId: unknown): clipId is string {
  return typeof clipId === 'string' && project.clips.some((clip) => clip.id === clipId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function invalidPlan(message: string): { success: false; code: 'INVALID_PLAN'; message: string } {
  return { success: false, code: 'INVALID_PLAN', message }
}

function unsupportedAction(message: string): {
  success: false
  code: 'UNSUPPORTED_ACTION'
  message: string
} {
  return { success: false, code: 'UNSUPPORTED_ACTION', message }
}

function staleContext(): AgentToolExecutionResult {
  return {
    success: false,
    code: 'STALE_CONTEXT',
    message: '工程已发生变化，请重新读取工程并生成计划',
    changed: false,
    affectedClipIds: []
  }
}
