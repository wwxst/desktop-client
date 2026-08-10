import { describe, expect, it } from 'vitest'
import { applyEditorTransactionWithResult } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorCommands'
import { createInitialEditorProjectState } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorProject'
import { planMoveClips, planPlaceAsset, type EditorIdFactory } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/core/editorPlacementPolicy'

const ids: EditorIdFactory = {
  clip: (() => { let i = 0; return () => `clip-${++i}` })(),
  visualTrack: (() => { let i = 0; return () => `visual-${++i}` })(),
  audioTrack: (() => { let i = 0; return () => `audio-${++i}` })()
}

function project() {
  const state = createInitialEditorProjectState('draft-1')
  return {
    ...state,
    assets: [
      { id: 'a', name: 'a.mp4', url: 'blob:a', duration: 10, status: 'ready' as const, kind: 'video' as const },
      { id: 'b', name: 'b.mp4', url: 'blob:b', duration: 5, status: 'ready' as const, kind: 'video' as const }
    ]
  }
}

describe('Editor V2 placement policy', () => {
  it('目标视觉层碰撞时自动创建新层', () => {
    let state = project()
    const first = planPlaceAsset(state, { assetId: 'a', timelineStart: 0 }, ids)
    const firstResult = applyEditorTransactionWithResult(state, first.commands)
    expect(firstResult.success).toBe(true)
    state = firstResult.state

    const mainTrackId = state.clips[0].trackId!
    const second = planPlaceAsset(state, { assetId: 'b', timelineStart: 2, trackId: mainTrackId }, ids)
    const result = applyEditorTransactionWithResult(state, second.commands)
    expect(result.success).toBe(true)
    // 可以复用已有空视觉层，也可以动态新建层；关键是不允许和主内容在同一层重叠。
    expect(result.state.clips[1].trackId).not.toBe(mainTrackId)
  })

  it('多选向右移动使用安全顺序，不和组选中 Clip 原位置冲突', () => {
    let state = project()
    const main = state.tracks.find((track) => track.role === 'main')!
    const add = [
      ...planPlaceAsset(state, { assetId: 'b', timelineStart: 0, trackId: main.id, clipId: 'left' }, ids).commands
    ]
    state = applyEditorTransactionWithResult(state, add).state
    const add2 = planPlaceAsset(state, { assetId: 'b', timelineStart: 5, trackId: main.id, clipId: 'right' }, ids)
    state = applyEditorTransactionWithResult(state, add2.commands).state

    const move = planMoveClips(state, [
      { clipId: 'left', timelineStart: 5, trackId: main.id },
      { clipId: 'right', timelineStart: 10, trackId: main.id }
    ], ids)
    const result = applyEditorTransactionWithResult(state, move.commands)
    expect(result.success).toBe(true)
    expect(result.state.clips.find((clip) => clip.id === 'left')?.timelineStart).toBe(5)
    expect(result.state.clips.find((clip) => clip.id === 'right')?.timelineStart).toBe(10)
  })
})
