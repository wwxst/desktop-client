import { describe, expect, it } from 'vitest'
import { editorHistoryReducer, createInitialEditorHistoryState } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorHistory'
import type { MediaAsset } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorProject'

function readyAsset(id = 'asset-a'): MediaAsset {
  return {
    id,
    name: `${id}.mp4`,
    url: `blob:${id}`,
    duration: 10,
    status: 'ready' as const,
    kind: 'video' as const,
    width: 1080,
    height: 1920
  }
}

describe('Editor V2 history external fact rebase', () => {
  it('导入新素材不会清空已有剪辑 Undo', () => {
    let state = createInitialEditorHistoryState('draft-1')
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'assets/imported', asset: readyAsset('asset-a') }
    })
    state = editorHistoryReducer(state, {
      type: 'command/execute',
      command: { type: 'clip/addAsset', assetId: 'asset-a', clipId: 'clip-a' }
    })
    expect(state.past.length).toBe(1)

    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'assets/imported', asset: readyAsset('asset-b') }
    })

    expect(state.past.length).toBe(1)
    state = editorHistoryReducer(state, { type: 'history/undo' })
    expect(state.present.clips).toHaveLength(0)
    expect(state.present.assets.map((asset) => asset.id)).toEqual(['asset-a', 'asset-b'])
  })

  it('媒体 ready 结果在 Undo 以后仍然保持 ready', () => {
    let state = createInitialEditorHistoryState('draft-1')
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: {
        type: 'assets/imported',
        asset: { ...readyAsset('asset-a'), duration: null, status: 'loading' }
      }
    })
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'asset/ready', assetId: 'asset-a', duration: 12, width: 1920, height: 1080 }
    })
    expect(state.present.assets[0].width).toBe(1920)
    expect(state.present.assets[0].height).toBe(1080)
  })
})
