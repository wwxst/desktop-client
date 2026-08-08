import type { EditorCommand } from './editorCommands'
import type { EditorProjectState } from './editorProject'

export interface EditorCapability {
  name: EditorCommand['type']
  description: string
}

export interface EditorAgentApi {
  getProjectSnapshot: () => EditorProjectState
  getCapabilities: () => readonly EditorCapability[]
  execute: (command: EditorCommand) => void
  executeBatch: (commands: readonly EditorCommand[]) => void
  undo: () => void
  redo: () => void
}

export interface EditorAgentApiDependencies {
  getProject: () => EditorProjectState
  execute: (command: EditorCommand) => void
  executeBatch: (commands: readonly EditorCommand[]) => void
  undo: () => void
  redo: () => void
}

const capabilities: readonly EditorCapability[] = [
  { name: 'clip/addAsset', description: '把素材添加到指定轨道/时间位置' },
  { name: 'clip/delete', description: '删除时间线片段' },
  { name: 'clip/move', description: '移动片段到新的时间或轨道' },
  { name: 'clip/trim', description: '修改素材入点、出点和时间线起点' },
  { name: 'clip/split', description: '在指定项目时间切开片段' },
  { name: 'clip/update', description: '修改位置、缩放、旋转、速度、音量、透明度等参数' },
  { name: 'clip/duplicate', description: '复制片段' },
  { name: 'track/update', description: '锁定、隐藏、静音或重命名轨道' },
  { name: 'canvas/setAspectRatio', description: '修改项目画布比例' }
]

export function createEditorAgentApi(deps: EditorAgentApiDependencies): EditorAgentApi {
  return {
    getProjectSnapshot: () => cloneProject(deps.getProject()),
    getCapabilities: () => capabilities,
    execute: deps.execute,
    executeBatch: deps.executeBatch,
    undo: deps.undo,
    redo: deps.redo
  }
}

/**
 * Agent 面板和编辑器工作区之间的轻量注册中心。
 * 未来 AiPanel / MCP / LangGraph 只需要拿这里的 API，不直接碰 React state。
 */
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
