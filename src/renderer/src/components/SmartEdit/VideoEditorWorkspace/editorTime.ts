export const DEFAULT_EDITOR_FPS = 30

export interface SnapResult {
  time: number
  snapped: boolean
  target: number | null
}

export function formatTimecode(seconds: number, precision = 2): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secondValue = safe % 60
  const secondText = secondValue.toFixed(precision).padStart(precision > 0 ? 3 + precision : 2, '0')

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${secondText}`
  }
  return `${String(minutes).padStart(2, '0')}:${secondText}`
}

export function formatFrameTimecode(seconds: number, fps = DEFAULT_EDITOR_FPS): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const wholeSeconds = Math.floor(safe)
  const hours = Math.floor(wholeSeconds / 3600)
  const minutes = Math.floor((wholeSeconds % 3600) / 60)
  const secs = wholeSeconds % 60
  const frames = Math.min(fps - 1, Math.floor((safe - wholeSeconds) * fps))
  return [hours, minutes, secs, frames].map((value) => String(value).padStart(2, '0')).join(':')
}

export function getRulerStep(zoom: number): number {
  if (zoom >= 180) return 0.5
  if (zoom >= 96) return 1
  if (zoom >= 52) return 2
  if (zoom >= 32) return 5
  return 10
}

export function snapTimeToCandidates(
  requestedTime: number,
  candidates: readonly number[],
  thresholdSeconds: number
): SnapResult {
  const safeRequested = Math.max(0, finiteOr(requestedTime, 0))
  let nearest: number | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    if (!Number.isFinite(candidate) || candidate < 0) continue
    const distance = Math.abs(candidate - safeRequested)
    if (distance <= thresholdSeconds && distance < nearestDistance) {
      nearest = candidate
      nearestDistance = distance
    }
  }

  return nearest === null
    ? { time: safeRequested, snapped: false, target: null }
    : { time: nearest, snapped: true, target: nearest }
}

export function quantizeTime(seconds: number, precision = 3): number {
  const multiplier = 10 ** precision
  return Math.round(Math.max(0, finiteOr(seconds, 0)) * multiplier) / multiplier
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}
