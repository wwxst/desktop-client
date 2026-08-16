import { describe, expect, it } from 'vitest'
import {
  isCodexApprovalResponseRequest,
  isCodexInterruptTurnRequest,
  isCodexResumeThreadRequest,
  isCodexStartThreadRequest,
  isCodexStartTurnRequest
} from '../src/shared/codex'

describe('Codex IPC request validation', () => {
  it('accepts the strict supported request shapes', () => {
    expect(isCodexStartThreadRequest({ model: 'gpt-5', permissionMode: 'request' })).toBe(true)
    expect(isCodexResumeThreadRequest({ threadId: 'thread-1', permissionMode: 'smart' })).toBe(true)
    expect(
      isCodexStartTurnRequest({ threadId: 'thread-1', text: '开始', permissionMode: 'full' })
    ).toBe(true)
    expect(isCodexInterruptTurnRequest({ threadId: 'thread-1', turnId: 'turn-1' })).toBe(true)
    expect(isCodexApprovalResponseRequest({ requestId: 'approval-1', decision: 'decline' })).toBe(
      true
    )
  })

  it('rejects unknown fields, empty values, and unsupported decisions', () => {
    expect(isCodexStartThreadRequest({ permissionMode: 'never' })).toBe(false)
    expect(
      isCodexStartTurnRequest({
        threadId: 'thread-1',
        text: '开始',
        permissionMode: 'request',
        cwd: 'C:\\unsafe'
      })
    ).toBe(false)
    expect(isCodexInterruptTurnRequest({ threadId: '', turnId: 'turn-1' })).toBe(false)
    expect(isCodexApprovalResponseRequest({ requestId: 'approval-1', decision: 'always' })).toBe(
      false
    )
  })
})
