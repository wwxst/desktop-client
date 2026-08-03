import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CANVAS_ASPECT_RATIO,
  createInitialEditorProjectState,
  editorProjectReducer,
  selectActiveAsset,
  type MediaAsset
} from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorProject'

const firstAsset: MediaAsset = {
  id: 'asset-1',
  name: 'asset-1.mp4',
  url: 'file:///asset-1.mp4',
  duration: null,
  status: 'loading'
}
const secondAsset: MediaAsset = {
  id: 'asset-2',
  name: 'asset-2.mp4',
  url: 'file:///asset-2.mp4',
  duration: null,
  status: 'loading'
}

describe('editor project reducer', () => {
  it('adds a ready asset once, creates and activates its clip, and selects it', () => {
    let state = createInitialEditorProjectState('row-1')
    state = editorProjectReducer(state, { type: 'assets/imported', asset: firstAsset })
    expect(state.clips).toEqual([])
    expect(state.activeClipId).toBeNull()
    expect(selectActiveAsset(state)).toBeNull()

    state = editorProjectReducer(state, {
      type: 'asset/ready',
      assetId: 'asset-1',
      duration: 12.5
    })
    const added = editorProjectReducer(state, {
      type: 'timeline/assetAdded',
      assetId: 'asset-1'
    })

    expect(added.clips).toHaveLength(1)
    expect(added.clips[0].assetId).toBe('asset-1')
    expect(added.activeClipId).toBe(added.clips[0].id)
    expect(selectActiveAsset(added)).toEqual({
      ...firstAsset,
      duration: 12.5,
      status: 'ready'
    })
    expect(editorProjectReducer(added, { type: 'timeline/assetAdded', assetId: 'asset-1' })).toBe(
      added
    )
  })

  it('appends clips in add order and selects an existing clip', () => {
    let state = createInitialEditorProjectState('row-1')
    for (const asset of [firstAsset, secondAsset]) {
      state = editorProjectReducer(state, { type: 'assets/imported', asset })
      state = editorProjectReducer(state, {
        type: 'asset/ready',
        assetId: asset.id,
        duration: 8
      })
      state = editorProjectReducer(state, { type: 'timeline/assetAdded', assetId: asset.id })
    }

    expect(state.clips.map((clip) => clip.assetId)).toEqual(['asset-1', 'asset-2'])
    expect(selectActiveAsset(state)?.id).toBe('asset-2')

    const selected = editorProjectReducer(state, {
      type: 'timeline/clipSelected',
      clipId: state.clips[0].id
    })
    expect(selected.activeClipId).toBe(state.clips[0].id)
    expect(selectActiveAsset(selected)?.id).toBe('asset-1')
    expect(editorProjectReducer(selected, { type: 'timeline/clipSelected', clipId: 'missing' })).toBe(
      selected
    )
  })

  it('only adds ready assets and records readiness and errors immutably', () => {
    let state = createInitialEditorProjectState('row-1')
    state = editorProjectReducer(state, { type: 'assets/imported', asset: firstAsset })

    expect(editorProjectReducer(state, { type: 'timeline/assetAdded', assetId: 'asset-1' })).toBe(
      state
    )
    expect(editorProjectReducer(state, { type: 'timeline/assetAdded', assetId: 'missing' })).toBe(
      state
    )

    const ready = editorProjectReducer(state, {
      type: 'asset/ready',
      assetId: 'asset-1',
      duration: 4
    })
    expect(ready).not.toBe(state)
    expect(ready.assets[0]).toEqual({ ...firstAsset, duration: 4, status: 'ready' })

    const failed = editorProjectReducer(ready, {
      type: 'asset/failed',
      assetId: 'asset-1',
      error: 'cannot decode'
    })
    expect(failed.assets[0]).toMatchObject({ status: 'error', error: 'cannot decode' })
  })

  it('manages draft rows while retaining at least one row', () => {
    let state = createInitialEditorProjectState('row-1')
    state = editorProjectReducer(state, {
      type: 'draft/rowAdded',
      rowId: 'row-2',
      afterRowId: 'row-1'
    })
    expect(state.draftRows.map((row) => row.id)).toEqual(['row-1', 'row-2'])

    state = editorProjectReducer(state, {
      type: 'draft/rowUpdated',
      rowId: 'row-2',
      changes: { draftName: 'Chapter 2', audio: 'narration.mp3' }
    })
    expect(state.draftRows[1]).toEqual({
      id: 'row-2',
      draftName: 'Chapter 2',
      fixedStartFileName: '选择视频',
      audio: 'narration.mp3',
      fixedEndFileName: '选择视频'
    })

    state = editorProjectReducer(state, { type: 'draft/rowDeleted', rowId: 'row-1' })
    expect(state.draftRows.map((row) => row.id)).toEqual(['row-2'])
    expect(editorProjectReducer(state, { type: 'draft/rowDeleted', rowId: 'row-2' })).toBe(state)
  })

  it('starts with a 9:16 canvas and updates the selected ratio', () => {
    const initial = createInitialEditorProjectState('row-1')
    expect(initial.aspectRatio).toEqual(DEFAULT_CANVAS_ASPECT_RATIO)
    expect(initial.aspectRatio).toEqual({
      id: '9:16',
      label: '9:16（抖音）',
      width: 9,
      height: 16
    })

    const selected = editorProjectReducer(initial, {
      type: 'aspectRatio/selected',
      aspectRatio: { id: '16:9', label: '横屏', width: 16, height: 9 }
    })
    expect(selected.aspectRatio).toEqual({ id: '16:9', label: '横屏', width: 16, height: 9 })
  })
})
