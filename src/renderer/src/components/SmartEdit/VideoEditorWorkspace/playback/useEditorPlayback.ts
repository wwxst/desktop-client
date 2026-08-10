import { useSyncExternalStore } from 'react'
import type { EditorPlaybackController, EditorPlaybackSnapshot } from './editorPlaybackController'

const NOOP_SUBSCRIBE = (): (() => void) => () => undefined

export function useEditorPlayback(controller: EditorPlaybackController): EditorPlaybackSnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
}

export function useEditorPlayhead(
  controller: EditorPlaybackController | undefined,
  fallback: number
): number {
  return useSyncExternalStore(
    controller?.subscribe ?? NOOP_SUBSCRIBE,
    controller ? () => controller.getSnapshot().playhead : () => fallback,
    controller ? () => controller.getSnapshot().playhead : () => fallback
  )
}
