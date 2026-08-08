export interface SourceRangeInput {
  sourceStart?: number
  sourceEnd?: number
  assetDuration: number | null | undefined
  minDuration?: number
}

export interface NormalizedSourceRange {
  sourceStart: number
  sourceEnd: number
}

const DEFAULT_MIN_DURATION = 0.05

export type ClipAssetKind = 'video' | 'image' | 'audio'
export type TargetTrackKind = 'video' | 'audio' | 'text' | 'overlay'

/** Keep a clip's source range inside the media asset while preserving a usable minimum range. */
export function normalizeSourceRange({
  sourceStart,
  sourceEnd,
  assetDuration,
  minDuration = DEFAULT_MIN_DURATION
}: SourceRangeInput): NormalizedSourceRange {
  const duration = finitePositiveOr(assetDuration, 0)
  if (duration <= 0) return { sourceStart: 0, sourceEnd: 0 }

  const requestedMinimum = finitePositiveOr(minDuration, DEFAULT_MIN_DURATION)
  const effectiveMinimum = Math.min(duration, requestedMinimum)
  const maxSourceStart = Math.max(0, duration - effectiveMinimum)
  const normalizedStart = clamp(finiteOr(sourceStart, 0), 0, maxSourceStart)
  const normalizedEnd = clamp(
    finiteOr(sourceEnd, duration),
    normalizedStart + effectiveMinimum,
    duration
  )

  return {
    sourceStart: normalizedStart,
    sourceEnd: normalizedEnd
  }
}

export function canMoveClipToTrack(
  assetKind: ClipAssetKind,
  targetTrackKind: TargetTrackKind
): boolean {
  if (assetKind === 'audio') return targetTrackKind === 'audio'
  return (assetKind === 'video' || assetKind === 'image') &&
    (targetTrackKind === 'video' || targetTrackKind === 'overlay')
}

function finitePositiveOr(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
