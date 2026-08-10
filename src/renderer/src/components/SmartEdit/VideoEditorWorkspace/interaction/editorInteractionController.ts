import type { EditorInteractionMode } from '../editorInteraction'

export interface EditorInteractionSnapshot {
  mode: EditorInteractionMode
  pointerId: number | null
  spacePressed: boolean
  spaceGestureUsed: boolean
  revision: number
}

export interface EditorInteractionController {
  getSnapshot(): EditorInteractionSnapshot
  subscribe(listener: () => void): () => void
  canBegin(mode: EditorInteractionMode): boolean
  begin(mode: EditorInteractionMode, pointerId?: number | null): boolean
  end(mode?: EditorInteractionMode): void
  cancel(): void
  setSpacePressed(pressed: boolean): void
  markSpaceGestureUsed(): void
}

export function createEditorInteractionController(): EditorInteractionController {
  let snapshot: EditorInteractionSnapshot = {
    mode: 'idle',
    pointerId: null,
    spacePressed: false,
    spaceGestureUsed: false,
    revision: 0
  }
  const listeners = new Set<() => void>()

  const publish = (patch: Partial<EditorInteractionSnapshot>): void => {
    snapshot = { ...snapshot, ...patch, revision: snapshot.revision + 1 }
    listeners.forEach((listener) => listener())
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    canBegin(mode) {
      return snapshot.mode === 'idle' || snapshot.mode === mode
    },
    begin(mode, pointerId = null) {
      if (snapshot.mode !== 'idle' && snapshot.mode !== mode) return false
      publish({ mode, pointerId })
      return true
    },
    end(mode) {
      if (mode && snapshot.mode !== mode) return
      publish({ mode: 'idle', pointerId: null })
    },
    cancel() {
      publish({ mode: 'idle', pointerId: null })
    },
    setSpacePressed(pressed) {
      if (pressed) {
        publish({ spacePressed: true, spaceGestureUsed: false })
      } else {
        publish({ spacePressed: false })
      }
    },
    markSpaceGestureUsed() {
      if (!snapshot.spaceGestureUsed) publish({ spaceGestureUsed: true })
    }
  }
}
