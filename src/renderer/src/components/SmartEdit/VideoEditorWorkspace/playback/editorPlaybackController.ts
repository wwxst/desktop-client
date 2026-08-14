export interface EditorPlaybackSnapshot {
  playhead: number
  isPlaying: boolean
  duration: number
  revision: number
}

export interface PlaybackClock {
  now(): number
  request(callback: (timestamp: number) => void): number
  cancel(id: number): void
}

export interface EditorPlaybackController {
  getSnapshot(): EditorPlaybackSnapshot
  subscribe(listener: () => void): () => void
  setDuration(duration: number): void
  seek(time: number): void
  play(): void
  pause(): void
  toggle(): void
  step(deltaSeconds: number): void
  dispose(): void
}

function createBrowserClock(): PlaybackClock {
  return {
    now: () => performance.now(),
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id)
  }
}

export function createEditorPlaybackController(
  initialPlayhead = 0,
  clock: PlaybackClock = createBrowserClock()
): EditorPlaybackController {
  let snapshot: EditorPlaybackSnapshot = {
    playhead: Math.max(0, initialPlayhead),
    isPlaying: false,
    duration: 0,
    revision: 0
  }
  let frameId: number | null = null
  let lastTimestamp = 0
  const listeners = new Set<() => void>()

  const publish = (patch: Partial<EditorPlaybackSnapshot>): void => {
    const next = { ...snapshot, ...patch, revision: snapshot.revision + 1 }
    if (
      next.playhead === snapshot.playhead &&
      next.isPlaying === snapshot.isPlaying &&
      next.duration === snapshot.duration
    )
      return
    snapshot = next
    listeners.forEach((listener) => listener())
  }

  const stopFrame = (): void => {
    if (frameId !== null) clock.cancel(frameId)
    frameId = null
  }

  const tick = (timestamp: number): void => {
    if (!snapshot.isPlaying) {
      frameId = null
      return
    }
    const elapsed = Math.max(0, (timestamp - lastTimestamp) / 1000)
    lastTimestamp = timestamp
    let next = snapshot.playhead + elapsed

    if (next >= snapshot.duration) {
      next = snapshot.duration
      publish({ playhead: next, isPlaying: false })
      frameId = null
      return
    }

    publish({ playhead: next })
    frameId = clock.request(tick)
  }

  const controller: EditorPlaybackController = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setDuration(duration) {
      const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0)
      const playhead = Math.min(snapshot.playhead, safeDuration)
      publish({
        duration: safeDuration,
        playhead,
        isPlaying: safeDuration > 0 ? snapshot.isPlaying : false
      })
    },
    seek(time) {
      const playhead = Math.max(0, Math.min(snapshot.duration, Number.isFinite(time) ? time : 0))
      publish({ playhead })
    },
    play() {
      if (snapshot.duration <= 0 || snapshot.isPlaying) return
      if (snapshot.playhead >= snapshot.duration) publish({ playhead: 0 })
      publish({ isPlaying: true })
      lastTimestamp = clock.now()
      stopFrame()
      frameId = clock.request(tick)
    },
    pause() {
      if (!snapshot.isPlaying) return
      publish({ isPlaying: false })
      stopFrame()
    },
    toggle() {
      if (snapshot.isPlaying) controller.pause()
      else controller.play()
    },
    step(deltaSeconds) {
      controller.pause()
      controller.seek(snapshot.playhead + deltaSeconds)
    },
    dispose() {
      stopFrame()
      listeners.clear()
      snapshot = { ...snapshot, isPlaying: false }
    }
  }

  return controller
}
