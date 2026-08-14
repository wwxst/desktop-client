import { describe, expect, it, vi } from 'vitest'
import type { AgentEditorPlan } from '../src/shared/agent/workflow'
import {
  compileAgentEditorPlan,
  executeAgentEditorPlan
} from '../src/renderer/src/components/AiPanel/agentEditorPlanExecutor'
import {
  createEditorAgentApi,
  type EditorAgentApi
} from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorAgentApi'
import {
  applyEditorCommand,
  applyEditorCommandsWithResult,
  applyEditorTransactionWithResult,
  type EditorBatchCommandResult,
  type EditorCommand
} from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorCommands'
import {
  editorHistoryReducer,
  type EditorHistoryState
} from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorHistory'
import {
  createInitialEditorProjectState,
  MAIN_VISUAL_TRACK_ID,
  type EditorProjectState
} from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorProject'

function createProject(): EditorProjectState {
  return {
    ...createInitialEditorProjectState('draft-1'),
    assets: [
      {
        id: 'asset-1',
        name: 'one.mp4',
        url: 'blob:one',
        duration: 4,
        status: 'ready',
        kind: 'video'
      },
      {
        id: 'asset-2',
        name: 'two.mp4',
        url: 'blob:two',
        duration: 4,
        status: 'ready',
        kind: 'video'
      }
    ],
    clips: [
      {
        id: 'clip-1',
        assetId: 'asset-1',
        trackId: MAIN_VISUAL_TRACK_ID,
        timelineStart: 0,
        sourceStart: 0,
        sourceEnd: 4,
        duration: 4
      },
      {
        id: 'clip-2',
        assetId: 'asset-2',
        trackId: MAIN_VISUAL_TRACK_ID,
        timelineStart: 4,
        sourceStart: 0,
        sourceEnd: 4,
        duration: 4
      }
    ]
  }
}

function plan(actions: AgentEditorPlan['actions'], summary = '整理两个片段'): AgentEditorPlan {
  return { planId: 'plan-1', projectRevision: 3, summary, actions }
}

function createApi(
  project: EditorProjectState,
  getRevision: () => number,
  executeTransaction: (
    commands: readonly EditorCommand[],
    label?: string
  ) => EditorBatchCommandResult
): EditorAgentApi {
  return createEditorAgentApi({
    getProject: () => project,
    getRevision,
    execute: (command) => applyEditorCommand(project, command),
    executeBatch: (commands) => applyEditorCommandsWithResult(project, commands),
    executeTransaction,
    undo: vi.fn(),
    redo: vi.fn()
  })
}

describe('Agent editor plan compiler', () => {
  it('compiles actions in order and deduplicates affected clip IDs', () => {
    const result = compileAgentEditorPlan(
      createProject(),
      plan([
        { type: 'clip.move', clipId: 'clip-2', timelineStart: 8 },
        { type: 'clip.update', clipId: 'clip-1', patch: { opacity: 0.5 } },
        { type: 'clip.update', clipId: 'clip-1', patch: { volume: 0.6 } }
      ])
    )

    expect(result).toMatchObject({ success: true })
    if (!result.success) return
    expect(result.compiled.commands.map((command) => command.type)).toEqual([
      'clip/move',
      'clip/update',
      'clip/update'
    ])
    expect(result.compiled.affectedClipIds).toEqual(['clip-2', 'clip-1'])
  })

  it('compiles magnet deletion including shifted clips', () => {
    const result = compileAgentEditorPlan(
      createProject(),
      plan([{ type: 'clip.delete', clipIds: ['clip-1'], magnetMainTrack: true }])
    )

    expect(result).toMatchObject({ success: true })
    if (!result.success) return
    expect(result.compiled.commands).toEqual([
      { type: 'clip/delete', clipId: 'clip-1' },
      { type: 'clip/move', clipId: 'clip-2', timelineStart: 0, trackId: MAIN_VISUAL_TRACK_ID }
    ])
    expect(result.compiled.affectedClipIds).toEqual(['clip-1', 'clip-2'])
  })

  it('uses the Renderer ID factory for split right clips', () => {
    const result = compileAgentEditorPlan(
      createProject(),
      plan([{ type: 'clip.split', clipId: 'clip-1', at: 2 }]),
      { clip: () => 'clip-right' }
    )

    expect(result).toMatchObject({ success: true })
    if (!result.success) return
    expect(result.compiled.commands).toEqual([
      { type: 'clip/split', clipId: 'clip-1', at: 2, rightClipId: 'clip-right' }
    ])
    expect(result.compiled.affectedClipIds).toEqual(['clip-1', 'clip-right'])
  })

  it('rejects a later missing target without exposing partial commands', () => {
    const result = compileAgentEditorPlan(
      createProject(),
      plan([
        { type: 'clip.move', clipId: 'clip-2', timelineStart: 8 },
        { type: 'clip.update', clipId: 'missing', patch: { opacity: 0.5 } }
      ])
    )

    expect(result).toMatchObject({ success: false, code: 'INVALID_PLAN' })
    expect(result).not.toHaveProperty('compiled')
  })

  it('rejects an action that cannot generate a command', () => {
    const result = compileAgentEditorPlan(
      createProject(),
      plan([{ type: 'clip.delete', clipIds: [] }])
    )

    expect(result).toMatchObject({ success: false, code: 'INVALID_PLAN' })
  })

  it('rejects a command that would not change the simulated project', () => {
    const result = compileAgentEditorPlan(
      createProject(),
      plan([{ type: 'clip.update', clipId: 'clip-1', patch: { opacity: 1 } }])
    )

    expect(result).toMatchObject({ success: false, code: 'INVALID_PLAN' })
  })

  it('rejects moves that collide on their requested track', () => {
    const result = compileAgentEditorPlan(
      createProject(),
      plan([
        {
          type: 'clip.move',
          clipId: 'clip-2',
          timelineStart: 2,
          trackId: MAIN_VISUAL_TRACK_ID
        }
      ])
    )

    expect(result).toMatchObject({ success: false, code: 'INVALID_PLAN' })
  })

  it('rejects moves from a locked track', () => {
    const project = createProject()
    project.tracks = project.tracks.map((track) =>
      track.id === MAIN_VISUAL_TRACK_ID ? { ...track, locked: true } : track
    )

    const result = compileAgentEditorPlan(
      project,
      plan([{ type: 'clip.move', clipId: 'clip-2', timelineStart: 8 }])
    )

    expect(result).toMatchObject({ success: false, code: 'INVALID_PLAN' })
  })

  it.each([{ opacity: 1.1 }, { volume: -0.1 }, { speed: 9 }, { transform: { scaleX: 101 } }])(
    'rejects an out-of-range update patch %#',
    (patch) => {
      const result = compileAgentEditorPlan(
        createProject(),
        plan([
          {
            type: 'clip.update',
            clipId: 'clip-1',
            patch
          } as AgentEditorPlan['actions'][number]
        ])
      )

      expect(result).toMatchObject({ success: false, code: 'INVALID_PLAN' })
    }
  )

  it('maps an unknown action to unsupported action', () => {
    const result = compileAgentEditorPlan(
      createProject(),
      plan([{ type: 'clip.replace', clipId: 'clip-1' } as never])
    )

    expect(result).toMatchObject({ success: false, code: 'UNSUPPORTED_ACTION' })
  })
})

describe('Agent editor plan execution', () => {
  it('compiles several actions and submits one transaction', () => {
    const project = createProject()
    const executeTransaction = vi.fn((commands: readonly EditorCommand[]) =>
      applyEditorTransactionWithResult(project, commands)
    )
    const api = createApi(project, () => 3, executeTransaction)

    const result = executeAgentEditorPlan(
      plan([
        { type: 'clip.move', clipId: 'clip-2', timelineStart: 8 },
        { type: 'clip.update', clipId: 'clip-1', patch: { opacity: 0.5 } }
      ]),
      api
    )

    expect(result).toMatchObject({
      success: true,
      code: 'OK',
      changed: true,
      affectedClipIds: ['clip-2', 'clip-1']
    })
    expect(executeTransaction).toHaveBeenCalledOnce()
    expect(executeTransaction.mock.calls[0][1]).toBe('AI：整理两个片段')
  })

  it('does not submit when a later action fails preflight', () => {
    const project = createProject()
    const executeTransaction = vi.fn((commands: readonly EditorCommand[]) =>
      applyEditorTransactionWithResult(project, commands)
    )
    const api = createApi(project, () => 3, executeTransaction)

    const result = executeAgentEditorPlan(
      plan([
        { type: 'clip.move', clipId: 'clip-2', timelineStart: 8 },
        { type: 'clip.update', clipId: 'missing', patch: { opacity: 0.5 } }
      ]),
      api
    )

    expect(result).toMatchObject({ success: false, code: 'INVALID_PLAN', changed: false })
    expect(executeTransaction).not.toHaveBeenCalled()
  })

  it('rejects stale context before compilation', () => {
    const project = createProject()
    const executeTransaction = vi.fn((commands: readonly EditorCommand[]) =>
      applyEditorTransactionWithResult(project, commands)
    )
    const api = createApi(project, () => 4, executeTransaction)

    expect(
      executeAgentEditorPlan(
        plan([{ type: 'clip.update', clipId: 'clip-1', patch: { opacity: 0.5 } }]),
        api
      )
    ).toMatchObject({ code: 'STALE_CONTEXT', changed: false })
    expect(executeTransaction).not.toHaveBeenCalled()
  })

  it('rechecks revision immediately before committing', () => {
    const project = createProject()
    const getRevision = vi.fn().mockReturnValueOnce(3).mockReturnValueOnce(4)
    const executeTransaction = vi.fn((commands: readonly EditorCommand[]) =>
      applyEditorTransactionWithResult(project, commands)
    )
    const api = createApi(project, getRevision, executeTransaction)

    const result = executeAgentEditorPlan(
      plan([{ type: 'clip.update', clipId: 'clip-1', patch: { opacity: 0.5 } }]),
      api
    )

    expect(result).toMatchObject({ code: 'STALE_CONTEXT', changed: false })
    expect(getRevision).toHaveBeenCalledTimes(2)
    expect(executeTransaction).not.toHaveBeenCalled()
  })

  it('maps transaction failures without reporting affected clips', () => {
    const project = createProject()
    const executeTransaction = vi.fn((): EditorBatchCommandResult => ({
      state: project,
      success: false,
      changed: false,
      code: 'TRANSACTION_ABORTED',
      results: [],
      message: 'failed'
    }))
    const api = createApi(project, () => 3, executeTransaction)

    const result = executeAgentEditorPlan(
      plan([{ type: 'clip.update', clipId: 'clip-1', patch: { opacity: 0.5 } }]),
      api
    )

    expect(result).toMatchObject({
      success: false,
      code: 'EXECUTION_FAILED',
      changed: false,
      affectedClipIds: []
    })
  })

  it('creates exactly one undo step for a successful multi-action plan', () => {
    let history: EditorHistoryState = {
      past: [],
      present: createProject(),
      future: [],
      revision: 3
    }
    const executeTransaction = vi.fn(
      (commands: readonly EditorCommand[], label?: string): EditorBatchCommandResult => {
        const result = applyEditorTransactionWithResult(history.present, commands)
        if (result.success && result.changed) {
          history = editorHistoryReducer(history, { type: 'command/transaction', commands, label })
        }
        return result
      }
    )
    const api = createEditorAgentApi({
      getProject: () => history.present,
      getRevision: () => history.revision,
      execute: (command) => applyEditorCommand(history.present, command),
      executeBatch: (commands) => applyEditorCommandsWithResult(history.present, commands),
      executeTransaction,
      undo: () => {
        history = editorHistoryReducer(history, { type: 'history/undo' })
      },
      redo: vi.fn()
    })

    const result = executeAgentEditorPlan(
      plan([
        { type: 'clip.move', clipId: 'clip-2', timelineStart: 8 },
        { type: 'clip.update', clipId: 'clip-1', patch: { opacity: 0.5 } }
      ]),
      api
    )

    expect(result.success).toBe(true)
    expect(history.past).toHaveLength(1)
    api.undo()
    expect(history.present.clips.find((clip) => clip.id === 'clip-2')?.timelineStart).toBe(4)
    expect(history.present.clips.find((clip) => clip.id === 'clip-1')?.opacity).not.toBe(0.5)
  })
})
