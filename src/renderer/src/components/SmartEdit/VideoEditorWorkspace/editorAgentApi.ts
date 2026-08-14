import type {
  ClipPatch,
  EditorBatchCommandResult,
  EditorCommand,
  EditorCommandResult
} from './editorCommands'
import type { EditorProjectState } from './editorProject'
import type { EditorService } from './core/editorService'
import type { MoveRequest } from './core/editorPlacementPolicy'

export interface EditorCapability {
  name: string
  description: string
}

export interface EditorAgentApi {
  getProjectSnapshot: () => EditorProjectState
  getRevision: () => number
  getSelection: () => readonly string[]
  getPlayhead: () => number
  getCapabilities: () => readonly EditorCapability[]
  /** 兼容已有 Agent：低层命令仍保留。新自动剪辑优先使用 service 能力。 */
  execute: (command: EditorCommand) => EditorCommandResult
  executeBatch: (commands: readonly EditorCommand[]) => EditorBatchCommandResult
  executeTransaction: (commands: readonly EditorCommand[], label?: string) => EditorBatchCommandResult
  placeAsset?: (input: { assetId: string; timelineStart: number; trackId?: string; forceNewLayer?: boolean }) => EditorBatchCommandResult
  moveClips?: (moves: readonly MoveRequest[]) => EditorBatchCommandResult
  deleteClips?: (clipIds: readonly string[], options?: { magnetMainTrack?: boolean }) => EditorBatchCommandResult
  updateClip?: (clipId: string, patch: ClipPatch, label?: string) => EditorBatchCommandResult
  splitClip?: (clipId: string, at: number) => EditorBatchCommandResult
  undo: () => void
  redo: () => void
}

export interface EditorAgentApiDependencies {
  getProject: () => EditorProjectState
  getRevision: () => number
  getSelection?: () => readonly string[]
  getPlayhead?: () => number
  execute: (command: EditorCommand) => EditorCommandResult
  executeBatch: (commands: readonly EditorCommand[]) => EditorBatchCommandResult
  executeTransaction: (commands: readonly EditorCommand[], label?: string) => EditorBatchCommandResult
  service?: EditorService
  undo: () => void
  redo: () => void
}

const capabilities: readonly EditorCapability[] = [
  { name: 'service/placeAsset', description: '按统一碰撞/自动建层规则把素材放到时间线（推荐 Agent 使用）' },
  { name: 'service/moveClips', description: '按统一 Placement Policy 移动一个或多个片段' },
  { name: 'service/deleteClips', description: '删除片段，可选择主内容磁吸' },
  { name: 'service/updateClip', description: '修改画面、音量、速度等 Clip 参数' },
  { name: 'service/splitClip', description: '在项目时间切开片段' },
  { name: 'clip/addAsset', description: '低层：把素材添加到指定内容层/时间位置' },
  { name: 'clip/add', description: '低层：从完整 Clip 数据创建片段' },
  { name: 'clip/delete', description: '低层：删除时间线片段' },
  { name: 'clip/move', description: '低层：移动片段；不建议自动化绕过 Service Policy' },
  { name: 'clip/trim', description: '修改素材入点、出点和时间线起点' },
  { name: 'clip/split', description: '在指定项目时间切开片段' },
  { name: 'clip/update', description: '修改位置、缩放、旋转、速度、音量、透明度等参数' },
  { name: 'track/update', description: '锁定、隐藏、静音或重命名内容层' },
  { name: 'canvas/setAspectRatio', description: '修改项目画布比例' },
  { name: 'transaction', description: '把多个编辑命令作为一个可一次撤销的原子操作执行' }
]

export function createEditorAgentApi(deps: EditorAgentApiDependencies): EditorAgentApi {
  return {
    getProjectSnapshot: () => cloneProject(deps.getProject()),
    getRevision: deps.getRevision,
    getSelection: () => [...(deps.getSelection?.() ?? [])],
    getPlayhead: () => deps.getPlayhead?.() ?? deps.getProject().playhead,
    getCapabilities: () => capabilities,
    execute: deps.execute,
    executeBatch: deps.executeBatch,
    executeTransaction: deps.executeTransaction,
    placeAsset: deps.service ? (input) => deps.service!.placeAsset(input) : undefined,
    moveClips: deps.service ? (moves) => deps.service!.moveClips(moves) : undefined,
    deleteClips: deps.service ? (clipIds, options) => deps.service!.deleteClips(clipIds, options) : undefined,
    updateClip: deps.service ? (clipId, patch, label) => deps.service!.updateClip(clipId, patch, label) : undefined,
    splitClip: deps.service ? (clipId, at) => deps.service!.splitClip(clipId, at) : undefined,
    undo: deps.undo,
    redo: deps.redo
  }
}

/** Agent 面板 / MCP / LangGraph 与编辑器的轻量注册中心。 */
let activeEditorApi: EditorAgentApi | null = null

export function registerEditorAgentApi(api: EditorAgentApi): () => void {
  activeEditorApi = api
  return () => {
    if (activeEditorApi === api) activeEditorApi = null
  }
}

export function getActiveEditorAgentApi(): EditorAgentApi | null {
  return activeEditorApi
}

function cloneProject(project: EditorProjectState): EditorProjectState {
  if (typeof structuredClone === 'function') return structuredClone(project)
  return JSON.parse(JSON.stringify(project)) as EditorProjectState
}
