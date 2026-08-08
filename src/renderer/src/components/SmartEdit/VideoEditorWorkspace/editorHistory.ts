import { applyEditorCommand, applyEditorCommands, type EditorCommand } from './editorCommands'
import {
  createInitialEditorProjectState,
  editorProjectReducer,
  type EditorProjectAction,
  type EditorProjectState
} from './editorProject'

const HISTORY_LIMIT = 100

export interface EditorHistoryState {
  past: EditorProjectState[]
  present: EditorProjectState
  future: EditorProjectState[]
}

export type EditorHistoryAction =
  | { type: 'project/action'; action: EditorProjectAction }
  | { type: 'command/execute'; command: EditorCommand }
  | { type: 'command/batch'; commands: readonly EditorCommand[] }
  | { type: 'history/undo' }
  | { type: 'history/redo' }
  | { type: 'history/clear' }

export function createInitialEditorHistoryState(draftRowId: string): EditorHistoryState {
  return {
    past: [],
    present: createInitialEditorProjectState(draftRowId),
    future: []
  }
}

export function editorHistoryReducer(
  state: EditorHistoryState,
  action: EditorHistoryAction
): EditorHistoryState {
  switch (action.type) {
    case 'project/action': {
      const present = editorProjectReducer(state.present, action.action)
      if (present === state.present) return state

      // 媒体导入/解码结果属于“外部事实”，不能被撤销回 loading 状态。
      // 一旦媒体事实变化，清空历史最安全；选择、播放头、缩放等 UI 状态不写历史。
      if (
        action.action.type === 'assets/imported' ||
        action.action.type === 'asset/ready' ||
        action.action.type === 'asset/failed' ||
        action.action.type.startsWith('draft/')
      ) {
        return { past: [], present, future: [] }
      }

      return { ...state, present }
    }

    case 'command/execute': {
      const result = applyEditorCommand(state.present, action.command)
      if (!result.changed) return state
      return pushHistory(state, result.state)
    }

    case 'command/batch': {
      if (action.commands.length === 0) return state
      const present = applyEditorCommands(state.present, action.commands)
      if (present === state.present) return state
      return pushHistory(state, present)
    }

    case 'history/undo': {
      const previous = state.past.at(-1)
      if (!previous) return state
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future].slice(0, HISTORY_LIMIT)
      }
    }

    case 'history/redo': {
      const next = state.future[0]
      if (!next) return state
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: next,
        future: state.future.slice(1)
      }
    }

    case 'history/clear':
      if (state.past.length === 0 && state.future.length === 0) return state
      return { past: [], present: state.present, future: [] }
  }
}

function pushHistory(state: EditorHistoryState, present: EditorProjectState): EditorHistoryState {
  return {
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present,
    future: []
  }
}
