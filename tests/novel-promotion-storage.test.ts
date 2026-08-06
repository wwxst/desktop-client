import { describe, expect, it } from 'vitest'
import {
  createDefaultNovelProject,
  validateNovelProject
} from '../src/renderer/src/components/NovelPromotion/novelPromotionStorage'
import type { NovelPromotionProject } from '../src/renderer/src/components/NovelPromotion/novelPromotionTypes'

function createReadyProject(): NovelPromotionProject {
  return {
    ...createDefaultNovelProject(),
    draftFolder: 'draft-folder',
    draftName: 'draft-name',
    audioItems: [
      {
        id: 'audio-1',
        fileName: 'chapter-1.mp3',
        fileSize: 100,
        durationSeconds: 12
      }
    ],
    commands: ['command-1'],
    materialFolder: 'materials',
    materialCount: 1,
    outputDirectory: 'output'
  }
}

describe('novel promotion project validation', () => {
  it('requires a detected剪映草稿结构 before starting', () => {
    const validation = validateNovelProject(createReadyProject())

    expect(validation.draftReady).toBe(false)
    expect(validation.canStart).toBe(false)
  })

  it('allows a complete project after the draft structure is detected', () => {
    const validation = validateNovelProject({
      ...createReadyProject(),
      draftDetected: true
    })

    expect(validation.draftReady).toBe(true)
    expect(validation.canStart).toBe(true)
  })
})
