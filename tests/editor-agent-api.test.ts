import { describe, expect, it, vi } from 'vitest'
import type { AgentChatMode } from '../src/shared/agent/workflow'
import { createEditorAgentApi } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorAgentApi'
import { executeAgentToolCall } from '../src/renderer/src/components/AiPanel/agentChatTools'
import {
  applyEditorCommand,
  applyEditorCommandsWithResult
} from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorCommands'
import {
  createInitialEditorProjectState,
  editorProjectReducer,
  type EditorProjectState,
  type MediaAsset
} from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorProject'

const asset: MediaAsset = {
  id: 'asset-1',
  name: 'demo.mp4',
  url: 'blob:demo',
  duration: 10,
  status: 'ready'
}

function createProject(): EditorProjectState {
  return editorProjectReducer(createInitialEditorProjectState('row-1'), {
    type: 'assets/imported',
    asset
  })
}

describe('EditorAgentApi execution results', () => {
  it('returns structured success and failure results without exposing mutable state', () => {
    let project = createProject()
    project = applyEditorCommand(project, {
      type: 'clip/addAsset',
      assetId: asset.id,
      clipId: 'clip-1'
    }).state

    const api = createEditorAgentApi({
      getProject: () => project,
      getRevision: () => 7,
      execute: (command) => applyEditorCommand(project, command),
      executeBatch: (commands) => applyEditorCommandsWithResult(project, commands),
      executeTransaction: (commands) => applyEditorCommandsWithResult(project, commands),
      undo: vi.fn(),
      redo: vi.fn()
    })

    const success = api.execute({ type: 'clip/move', clipId: 'clip-1', timelineStart: 2 })
    expect(success).toMatchObject({ success: true, changed: true, code: 'OK' })

    const failure = api.execute({
      type: 'clip/move',
      clipId: 'clip-1',
      timelineStart: 2,
      trackId: 'track-audio-main'
    })
    expect(failure).toMatchObject({
      success: false,
      changed: false,
      code: 'INCOMPATIBLE_TRACK'
    })

    const snapshot = api.getProjectSnapshot()
    snapshot.clips.push({ id: 'mutated', assetId: asset.id })
    expect(api.getProjectSnapshot().clips).toHaveLength(1)
    expect(api.getRevision()).toBe(7)
  })

  it('aggregates batch results while preserving individual error codes', () => {
    const project = createProject()
    const api = createEditorAgentApi({
      getProject: () => project,
      getRevision: () => 0,
      execute: (command) => applyEditorCommand(project, command),
      executeBatch: (commands) => applyEditorCommandsWithResult(project, commands),
      executeTransaction: (commands) => applyEditorCommandsWithResult(project, commands),
      undo: vi.fn(),
      redo: vi.fn()
    })

    const batch = api.executeBatch([
      { type: 'clip/addAsset', assetId: asset.id, clipId: 'clip-1' },
      { type: 'clip/addAsset', assetId: asset.id, clipId: 'clip-1' }
    ])

    expect(batch.changed).toBe(true)
    expect(batch.success).toBe(false)
    expect(batch.code).toBe('NO_CHANGE')
    expect(batch.results.map((result) => result.code)).toEqual(['OK', 'NO_CHANGE'])
  })

  it('returns a structured pending result for editor plans before the executor exists', () => {
    const executeTransaction = vi.fn()
    const api = createEditorAgentApi({
      getProject: createProject,
      getRevision: () => 0,
      getSelection: () => ['clip-1'],
      getPlayhead: () => 3,
      execute: (command) => applyEditorCommand(createProject(), command),
      executeBatch: (commands) => applyEditorCommandsWithResult(createProject(), commands),
      executeTransaction,
      undo: vi.fn(),
      redo: vi.fn()
    })

    expect(
      executeAgentToolCall(
        {
          id: 'call-1',
          name: 'propose_editor_plan',
          arguments: {
            planId: 'plan-1',
            projectRevision: 0,
            summary: '删除片段',
            actions: [{ type: 'clip.delete', clipIds: ['clip-1'] }]
          }
        },
        api,
        'agent'
      )
    ).toMatchObject({
      success: false,
      code: 'AWAITING_APPROVAL',
      changed: false,
      affectedClipIds: []
    })
    expect(executeTransaction).not.toHaveBeenCalled()
  })

  it('includes the editor revision in the structured context result', () => {
    const api = createEditorAgentApi({
      getProject: createProject,
      getRevision: () => 9,
      execute: (command) => applyEditorCommand(createProject(), command),
      executeBatch: (commands) => applyEditorCommandsWithResult(createProject(), commands),
      executeTransaction: (commands) => applyEditorCommandsWithResult(createProject(), commands),
      undo: vi.fn(),
      redo: vi.fn()
    })

    const result = executeAgentToolCall(
      { id: 'call-context', name: 'get_editor_context', arguments: {} },
      api,
      'assistant'
    )

    expect(result).toMatchObject({
      success: true,
      code: 'OK',
      changed: false,
      affectedClipIds: [],
      data: { revision: 9 }
    })
  })

  it('rejects a forged plan in Assistant mode without executing it', () => {
    const executeTransaction = vi.fn()
    const api = createEditorAgentApi({
      getProject: createProject,
      getRevision: () => 0,
      execute: (command) => applyEditorCommand(createProject(), command),
      executeBatch: (commands) => applyEditorCommandsWithResult(createProject(), commands),
      executeTransaction,
      undo: vi.fn(),
      redo: vi.fn()
    })
    const mode: AgentChatMode = 'assistant'

    const result = executeAgentToolCall(
      {
        id: 'forged-call',
        name: 'propose_editor_plan',
        arguments: {
          planId: 'plan-forged',
          projectRevision: 0,
          summary: '删除片段',
          actions: [{ type: 'clip.delete', clipIds: ['clip-1'] }]
        }
      },
      api,
      mode
    )

    expect(result).toMatchObject({
      success: false,
      code: 'UNSUPPORTED_ACTION',
      changed: false,
      affectedClipIds: []
    })
    expect(executeTransaction).not.toHaveBeenCalled()
  })
})
