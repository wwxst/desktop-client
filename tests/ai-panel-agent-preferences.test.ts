import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_APPROVAL_MODE_KEY,
  AI_EXECUTION_MODE_KEY,
  readAiApprovalMode,
  readAiExecutionMode,
  writeAiApprovalMode,
  writeAiExecutionMode
} from '../src/renderer/src/components/AiPanel/aiPanelAgentPreferences'

describe('AI panel Agent preferences', () => {
  beforeEach(() => {
    window.localStorage.removeItem(AI_EXECUTION_MODE_KEY)
    window.localStorage.removeItem(AI_APPROVAL_MODE_KEY)
  })

  it('uses safe defaults when preferences have not been stored', () => {
    expect(readAiExecutionMode()).toBe('agent')
    expect(readAiApprovalMode()).toBe('request')
  })

  it('persists execution and approval modes under independent keys', () => {
    writeAiExecutionMode('assistant')
    writeAiApprovalMode('smart')

    expect(window.localStorage.getItem(AI_EXECUTION_MODE_KEY)).toBe('assistant')
    expect(window.localStorage.getItem(AI_APPROVAL_MODE_KEY)).toBe('smart')
    expect(readAiExecutionMode()).toBe('assistant')
    expect(readAiApprovalMode()).toBe('smart')
  })

  it('falls back safely when stored values are invalid', () => {
    window.localStorage.setItem(AI_EXECUTION_MODE_KEY, 'invalid-mode')
    window.localStorage.setItem(AI_APPROVAL_MODE_KEY, 'always')

    expect(readAiExecutionMode()).toBe('agent')
    expect(readAiApprovalMode()).toBe('request')
  })

  it('does not clear the saved approval mode when switching to Assistant', () => {
    writeAiApprovalMode('full')
    writeAiExecutionMode('assistant')

    expect(readAiExecutionMode()).toBe('assistant')
    expect(readAiApprovalMode()).toBe('full')
    expect(window.localStorage.getItem(AI_APPROVAL_MODE_KEY)).toBe('full')
  })

  it('does not throw when preference storage is unavailable', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked')
      })
    } as unknown as Storage

    expect(readAiExecutionMode(storage)).toBe('agent')
    expect(readAiApprovalMode(storage)).toBe('request')
    expect(() => writeAiExecutionMode('assistant', storage)).not.toThrow()
    expect(() => writeAiApprovalMode('full', storage)).not.toThrow()
  })
})
