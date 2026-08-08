import { afterEach, describe, expect, it, vi } from 'vitest'
import { acquireAgentTts, hasActiveAgentTts, releaseAgentTts } from '../src/main/tts/services'

vi.mock('electron', () => ({
  app: { getPath: () => 'C:/temp' },
  dialog: {},
  net: {},
  shell: {}
}))

afterEach(() => {
  while (hasActiveAgentTts()) releaseAgentTts()
})

describe('shared TTS activity lock', () => {
  it('allows one Agent task at a time', () => {
    expect(acquireAgentTts()).toBe(true)
    expect(hasActiveAgentTts()).toBe(true)
    expect(acquireAgentTts()).toBe(false)

    releaseAgentTts()
    expect(hasActiveAgentTts()).toBe(false)
    expect(acquireAgentTts()).toBe(true)
  })
})
