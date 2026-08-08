import { describe, expect, it, vi } from 'vitest'
import { createEditorAgentApi } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorAgentApi'
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
})
