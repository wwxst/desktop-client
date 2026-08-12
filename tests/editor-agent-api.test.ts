import { describe, expect, it, vi } from 'vitest'
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
      execute: (command) => applyEditorCommand(project, command),
      executeBatch: (commands) => applyEditorCommandsWithResult(project, commands),
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
  })

  it('aggregates batch results while preserving individual error codes', () => {
    const project = createProject()
    const api = createEditorAgentApi({
      getProject: () => project,
      execute: (command) => applyEditorCommand(project, command),
      executeBatch: (commands) => applyEditorCommandsWithResult(project, commands),
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

  it('executes chat tools through EditorService capabilities', () => {
    const deleteClips = vi.fn().mockReturnValue({
      success: true,
      changed: true,
      code: 'OK',
      message: '删除片段',
      state: createProject(),
      results: []
    })
    const api = createEditorAgentApi({
      getProject: createProject,
      getSelection: () => ['clip-1'],
      getPlayhead: () => 3,
      execute: (command) => applyEditorCommand(createProject(), command),
      executeBatch: (commands) => applyEditorCommandsWithResult(createProject(), commands),
      executeTransaction: (commands) => applyEditorCommandsWithResult(createProject(), commands),
      service: { deleteClips } as never,
      undo: vi.fn(),
      redo: vi.fn()
    })

    expect(
      executeAgentToolCall(
        {
          id: 'call-1',
          name: 'delete_selected_clips',
          arguments: { magnetMainTrack: true }
        },
        api
      )
    ).toMatchObject({ success: true, message: '已删除 1 个片段' })
    expect(deleteClips).toHaveBeenCalledWith(['clip-1'], { magnetMainTrack: true })
  })
})
