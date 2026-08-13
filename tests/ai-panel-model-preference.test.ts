import { describe, expect, it, vi } from 'vitest'
import {
  LAST_USED_AGENT_MODEL_CONFIG_KEY,
  readLastUsedAgentModelConfigId,
  resolveAgentModelConfigId,
  writeLastUsedAgentModelConfigId
} from '../src/renderer/src/components/AiPanel/aiPanelModelPreference'

const configurations = [{ id: 'config-1' }, { id: 'config-2' }]

describe('AI panel model preference', () => {
  it('keeps a valid current selection before the stored preference', () => {
    expect(resolveAgentModelConfigId(configurations, 'config-2', 'config-1')).toBe('config-2')
  })

  it('uses a valid stored preference before the first model', () => {
    expect(resolveAgentModelConfigId(configurations, '', 'config-2')).toBe('config-2')
  })

  it('falls back to the first model and returns empty for an empty list', () => {
    expect(resolveAgentModelConfigId(configurations, '', 'deleted-config')).toBe('config-1')
    expect(resolveAgentModelConfigId([], '', 'deleted-config')).toBe('')
  })

  it('does not throw when preference storage is unavailable', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      removeItem: vi.fn(() => {
        throw new Error('blocked')
      })
    } as unknown as Storage

    expect(readLastUsedAgentModelConfigId(storage)).toBe('')
    expect(() => writeLastUsedAgentModelConfigId('config-1', storage)).not.toThrow()
    expect(() => writeLastUsedAgentModelConfigId('', storage)).not.toThrow()
  })

  it('writes and clears the dedicated preference key', () => {
    const storage = window.localStorage
    writeLastUsedAgentModelConfigId('config-2', storage)
    expect(storage.getItem(LAST_USED_AGENT_MODEL_CONFIG_KEY)).toBe('config-2')
    writeLastUsedAgentModelConfigId('', storage)
    expect(storage.getItem(LAST_USED_AGENT_MODEL_CONFIG_KEY)).toBeNull()
  })
})
