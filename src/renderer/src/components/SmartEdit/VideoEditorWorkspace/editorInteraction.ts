export const EDITOR_DRAG_THRESHOLD_PX = 4
export const EDITOR_EDGE_SCROLL_ZONE_PX = 36
export const EDITOR_EDGE_SCROLL_MAX_STEP_PX = 18

export type EditorInteractionMode =
  | 'idle'
  | 'selecting'
  | 'box-selecting'
  | 'moving-clip'
  | 'trimming-left'
  | 'trimming-right'
  | 'scrubbing-playhead'
  | 'panning-timeline'
  | 'panning-canvas'
  | 'moving-canvas-item'
  | 'scaling-canvas-item'
  | 'rotating-canvas-item'

export interface PointerOrigin {
  clientX: number
  clientY: number
}

export function hasExceededDragThreshold(
  origin: PointerOrigin,
  clientX: number,
  clientY: number,
  threshold = EDITOR_DRAG_THRESHOLD_PX
): boolean {
  const dx = clientX - origin.clientX
  const dy = clientY - origin.clientY
  return Math.hypot(dx, dy) >= threshold
}

export function getEdgeAutoScrollDelta(
  pointer: number,
  start: number,
  end: number,
  zone = EDITOR_EDGE_SCROLL_ZONE_PX,
  maxStep = EDITOR_EDGE_SCROLL_MAX_STEP_PX
): number {
  if (pointer < start + zone) {
    const strength = Math.min(1, Math.max(0, (start + zone - pointer) / zone))
    return -Math.max(1, Math.round(maxStep * strength))
  }
  if (pointer > end - zone) {
    const strength = Math.min(1, Math.max(0, (pointer - (end - zone)) / zone))
    return Math.max(1, Math.round(maxStep * strength))
  }
  return 0
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}
