import { describe, expect, it } from 'vitest'
import { normalizeSourceRange } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorClipMath'

const minDuration = 0.05

describe('normalizeSourceRange', () => {
  it('clamps the source start and end to the asset duration', () => {
    expect(
      normalizeSourceRange({
        sourceStart: 20,
        sourceEnd: 30,
        assetDuration: 12,
        minDuration
      })
    ).toEqual({ sourceStart: 11.95, sourceEnd: 12 })
  })

  it('keeps a minimum range when the requested start is at the end', () => {
    expect(
      normalizeSourceRange({
        sourceStart: 12,
        sourceEnd: 12,
        assetDuration: 12,
        minDuration
      })
    ).toEqual({ sourceStart: 11.95, sourceEnd: 12 })
  })

  it('uses the real duration for assets shorter than the minimum', () => {
    expect(
      normalizeSourceRange({
        sourceStart: 0,
        sourceEnd: 1,
        assetDuration: 0.02,
        minDuration
      })
    ).toEqual({ sourceStart: 0, sourceEnd: 0.02 })
  })

  it('returns an empty range for non-positive asset durations', () => {
    expect(
      normalizeSourceRange({
        sourceStart: 1,
        sourceEnd: 2,
        assetDuration: 0,
        minDuration
      })
    ).toEqual({ sourceStart: 0, sourceEnd: 0 })
  })
})
