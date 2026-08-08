import { describe, expect, it } from 'vitest'
import {
  createInitialEditorHistoryState,
  editorHistoryReducer
} from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorHistory'
import type { MediaAsset } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorProject'

const asset: MediaAsset = {
  id: 'asset-1',
  name: 'demo.mp4',
  url: 'blob:demo',
  duration: 10,
  status: 'ready'
}

describe('editor history', () => {
  it('undoes and redoes command changes', () => {
    let history = createInitialEditorHistoryState('row-1')
    history = editorHistoryReducer(history, {
      type: 'project/action',
      action: { type: 'assets/imported', asset }
    })
    history = editorHistoryReducer(history, {
      type: 'command/execute',
      command: { type: 'clip/addAsset', assetId: asset.id, clipId: 'clip-1' }
    })

    expect(history.present.clips).toHaveLength(1)
    history = editorHistoryReducer(history, { type: 'history/undo' })
    expect(history.present.clips).toHaveLength(0)
    history = editorHistoryReducer(history, { type: 'history/redo' })
    expect(history.present.clips).toHaveLength(1)
  })
})
