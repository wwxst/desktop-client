import { describe, expect, it } from 'vitest'
import { createEditorInteractionController } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/interaction/editorInteractionController'

describe('Editor V2 interaction controller', () => {
  it('同一时间只允许一个主交互', () => {
    const controller = createEditorInteractionController()
    expect(controller.begin('moving-clip', 1)).toBe(true)
    expect(controller.begin('panning-timeline', 2)).toBe(false)
    controller.end('moving-clip')
    expect(controller.begin('panning-timeline', 2)).toBe(true)
  })

  it('能区分 Space 点击和 Space+Drag 手势', () => {
    const controller = createEditorInteractionController()
    controller.setSpacePressed(true)
    expect(controller.getSnapshot().spaceGestureUsed).toBe(false)
    controller.markSpaceGestureUsed()
    expect(controller.getSnapshot().spaceGestureUsed).toBe(true)
    controller.setSpacePressed(false)
    expect(controller.getSnapshot().spacePressed).toBe(false)
  })
})
