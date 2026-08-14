import {
  applyEditorCommand,
  applyEditorCommands,
  applyEditorTransactionWithResult,
  type EditorCommand
} from './editorCommands'
import {
  createInitialEditorProjectState,
  editorProjectStatesEqual,
  editorProjectVersionedContentEqual,
  editorProjectReducer,
  type EditorProjectAction,
  type EditorProjectState
} from './editorProject'

const HISTORY_LIMIT = 100

export interface EditorHistoryState {
  past: EditorProjectState[]
  present: EditorProjectState
  future: EditorProjectState[]
  revision: number
}

export type EditorHistoryAction =
  | { type: 'project/action'; action: EditorProjectAction }
  | { type: 'command/execute'; command: EditorCommand }
  | { type: 'command/batch'; commands: readonly EditorCommand[] }
  | { type: 'command/transaction'; commands: readonly EditorCommand[]; label?: string }
  | { type: 'history/undo' }
  | { type: 'history/redo' }
  | { type: 'history/clear' }

export function createInitialEditorHistoryState(draftRowId: string): EditorHistoryState {
  return {
    past: [],
    present: createInitialEditorProjectState(draftRowId),
    future: [],
    revision: 0
  }
}

/**
 * 媒体导入/解码与 workflow 数据属于“外部事实”。
 * 它们不应该产生一个 Undo step，更不应该清空用户之前的剪辑历史。
 *
 * V2 采用 rebase：把同一外部事实同步到 past/present/future 的每个快照。
 * 这样用户导入一个素材后继续 Ctrl+Z，仍然只撤销剪辑动作，素材不会神秘消失或把历史清空。
 */
function isExternalFactAction(action: EditorProjectAction): boolean {
  return (
    action.type === 'assets/imported' ||
    action.type === 'asset/ready' ||
    action.type === 'asset/failed' ||
    action.type.startsWith('draft/')
  )
}

/** UI / playback 状态不进入项目历史。 */
function isEphemeralAction(action: EditorProjectAction): boolean {
  return (
    action.type === 'timeline/clipSelected' ||
    action.type === 'timeline/playheadChanged' ||
    action.type === 'timeline/zoomChanged'
  )
}

function applyActionToSnapshot(
  snapshot: EditorProjectState,
  action: EditorProjectAction
): EditorProjectState {
  return editorProjectReducer(snapshot, action)
}

/**
 * Undo/Redo 切换文档快照时保留当前 UI/playback 状态。
 * activeClip 只有在目标文档仍包含该 clip 时才保留。
 */
function preserveEphemeralState(
  target: EditorProjectState,
  current: EditorProjectState
): EditorProjectState {
  const activeClipId =
    current.activeClipId && target.clips.some((clip) => clip.id === current.activeClipId)
      ? current.activeClipId
      : null

  return {
    ...target,
    activeClipId,
    playhead: current.playhead,
    timelineZoom: current.timelineZoom
  }
}

export function editorHistoryReducer(
  state: EditorHistoryState,
  action: EditorHistoryAction
): EditorHistoryState {
  switch (action.type) {
    case 'project/action': {
      const present = editorProjectReducer(state.present, action.action)
      if (editorProjectStatesEqual(present, state.present)) return state

      if (isEphemeralAction(action.action)) {
        return { ...state, present }
      }

      if (editorProjectVersionedContentEqual(present, state.present)) {
        return { ...state, present }
      }

      if (isExternalFactAction(action.action)) {
        return {
          past: state.past.map((snapshot) => applyActionToSnapshot(snapshot, action.action)),
          present,
          future: state.future.map((snapshot) => applyActionToSnapshot(snapshot, action.action)),
          revision: state.revision + 1
        }
      }

      // 兼容旧的 project/action 文档修改入口：不新增 history step，但也绝不清空历史。
      return { ...state, present, revision: state.revision + 1 }
    }

    case 'command/execute': {
      const result = applyEditorCommand(state.present, action.command)
      if (!result.changed) return state
      if (editorProjectVersionedContentEqual(result.state, state.present)) {
        return { ...state, present: result.state }
      }
      return pushHistory(state, result.state)
    }

    case 'command/batch': {
      if (action.commands.length === 0) return state
      const present = applyEditorCommands(state.present, action.commands)
      if (editorProjectStatesEqual(present, state.present)) return state
      if (editorProjectVersionedContentEqual(present, state.present)) {
        return { ...state, present }
      }
      return pushHistory(state, present)
    }

    case 'command/transaction': {
      const result = applyEditorTransactionWithResult(state.present, action.commands)
      if (!result.success || !result.changed) return state
      if (editorProjectVersionedContentEqual(result.state, state.present)) {
        return { ...state, present: result.state }
      }
      return pushHistory(state, result.state)
    }

    case 'history/undo': {
      const previous = state.past.at(-1)
      if (!previous) return state
      return {
        past: state.past.slice(0, -1),
        present: preserveEphemeralState(previous, state.present),
        future: [state.present, ...state.future].slice(0, HISTORY_LIMIT),
        revision: state.revision + 1
      }
    }

    case 'history/redo': {
      const next = state.future[0]
      if (!next) return state
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: preserveEphemeralState(next, state.present),
        future: state.future.slice(1),
        revision: state.revision + 1
      }
    }

    case 'history/clear':
      if (state.past.length === 0 && state.future.length === 0) return state
      return { past: [], present: state.present, future: [], revision: state.revision }
  }
}

function pushHistory(state: EditorHistoryState, present: EditorProjectState): EditorHistoryState {
  return {
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present,
    future: [],
    revision: state.revision + 1
  }
}
