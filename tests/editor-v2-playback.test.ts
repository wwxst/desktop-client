import { describe, expect, it } from 'vitest'
import { createEditorPlaybackController, type PlaybackClock } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/playback/editorPlaybackController'

class FakeClock implements PlaybackClock {
  time = 0
  nextId = 1
  callbacks = new Map<number, (time: number) => void>()
  now = () => this.time
  request = (callback: (time: number) => void) => { const id = this.nextId++; this.callbacks.set(id, callback); return id }
  cancel = (id: number) => { this.callbacks.delete(id) }
  advance(ms: number) {
    this.time += ms
    const callbacks = [...this.callbacks.values()]
    this.callbacks.clear()
    callbacks.forEach((callback) => callback(this.time))
  }
}

describe('Editor V2 playback controller', () => {
  it('播放时钟独立推进，不依赖 Project reducer', () => {
    const clock = new FakeClock()
    const controller = createEditorPlaybackController(0, clock)
    controller.setDuration(10)
    controller.play()
    clock.advance(1000)
    expect(controller.getSnapshot().playhead).toBeCloseTo(1, 2)
    controller.pause()
  })

  it('支持 loop 和 master volume', () => {
    const clock = new FakeClock()
    const controller = createEditorPlaybackController(0, clock)
    controller.setDuration(2)
    controller.setLoop(true)
    controller.setMasterVolume(0.4)
    controller.seek(1.5)
    controller.play()
    clock.advance(1000)
    expect(controller.getSnapshot().playhead).toBeCloseTo(0.5, 2)
    expect(controller.getSnapshot().masterVolume).toBe(0.4)
  })
})
