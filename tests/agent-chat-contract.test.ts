import { describe, expect, it } from 'vitest'

import {
  isAgentChatRequest,
  isAgentToolExecutionResult,
  parseAgentToolCall
} from '../src/shared/agent/chatContract'

const validPlan = {
  planId: ' plan-1 ',
  projectRevision: 7,
  summary: ' Update the selected clips ',
  actions: [
    { type: 'clip.delete', clipIds: [' clip-a ', 'clip-a', 'clip-b'], magnetMainTrack: true },
    { type: 'clip.split', clipId: ' clip-c ', at: 12.5 },
    { type: 'clip.move', clipId: 'clip-d', timelineStart: 20, trackId: ' track-2 ' },
    {
      type: 'clip.update',
      clipId: 'clip-e',
      patch: {
        opacity: 0.75,
        volume: 0.5,
        muted: false,
        speed: 1.25,
        enabled: true,
        transform: { x: 10, y: -20, scaleX: 1.5, scaleY: 0.75, rotation: 45 }
      }
    }
  ]
}

describe('parseAgentToolCall', () => {
  it('normalizes every structured plan action in agent mode', () => {
    expect(
      parseAgentToolCall('agent', {
        id: ' call-1 ',
        name: 'propose_editor_plan',
        arguments: { plan: validPlan }
      })
    ).toEqual({
      id: 'call-1',
      name: 'propose_editor_plan',
      arguments: {
        plan: {
          planId: 'plan-1',
          projectRevision: 7,
          summary: 'Update the selected clips',
          actions: [
            { type: 'clip.delete', clipIds: ['clip-a', 'clip-b'], magnetMainTrack: true },
            { type: 'clip.split', clipId: 'clip-c', at: 12.5 },
            { type: 'clip.move', clipId: 'clip-d', timelineStart: 20, trackId: 'track-2' },
            {
              type: 'clip.update',
              clipId: 'clip-e',
              patch: {
                opacity: 0.75,
                volume: 0.5,
                muted: false,
                speed: 1.25,
                enabled: true,
                transform: { x: 10, y: -20, scaleX: 1.5, scaleY: 0.75, rotation: 45 }
              }
            }
          ]
        }
      }
    })
  })

  it('accepts only context reads in assistant mode', () => {
    expect(
      parseAgentToolCall('assistant', {
        id: 'context-1',
        name: 'get_editor_context',
        arguments: {}
      })
    ).toEqual({ id: 'context-1', name: 'get_editor_context', arguments: {} })

    expect(
      parseAgentToolCall('assistant', {
        id: 'plan-1',
        name: 'propose_editor_plan',
        arguments: { plan: validPlan }
      })
    ).toBeNull()
  })

  it.each([
    ['unknown tool', { id: 'call', name: 'delete_selected_clips', arguments: {} }],
    [
      'unknown call key',
      { id: 'call', name: 'get_editor_context', arguments: {}, executable: true }
    ],
    [
      'unknown plan key',
      {
        id: 'call',
        name: 'propose_editor_plan',
        arguments: { plan: { ...validPlan, executable: true } }
      }
    ],
    [
      'negative revision',
      {
        id: 'call',
        name: 'propose_editor_plan',
        arguments: { plan: { ...validPlan, projectRevision: -1 } }
      }
    ],
    [
      'fractional revision',
      {
        id: 'call',
        name: 'propose_editor_plan',
        arguments: { plan: { ...validPlan, projectRevision: 1.5 } }
      }
    ],
    [
      'non-finite split position',
      {
        id: 'call',
        name: 'propose_editor_plan',
        arguments: {
          plan: { ...validPlan, actions: [{ type: 'clip.split', clipId: 'clip', at: Infinity }] }
        }
      }
    ],
    [
      'arbitrary update field',
      {
        id: 'call',
        name: 'propose_editor_plan',
        arguments: {
          plan: {
            ...validPlan,
            actions: [{ type: 'clip.update', clipId: 'clip', patch: { arbitrary: true } }]
          }
        }
      }
    ],
    [
      'empty transform',
      {
        id: 'call',
        name: 'propose_editor_plan',
        arguments: {
          plan: {
            ...validPlan,
            actions: [{ type: 'clip.update', clipId: 'clip', patch: { transform: {} } }]
          }
        }
      }
    ],
    [
      '21 actions',
      {
        id: 'call',
        name: 'propose_editor_plan',
        arguments: {
          plan: {
            ...validPlan,
            actions: Array.from({ length: 21 }, (_, index) => ({
              type: 'clip.split',
              clipId: `clip-${index}`,
              at: index
            }))
          }
        }
      }
    ]
  ])('rejects %s', (_label, value) => {
    expect(parseAgentToolCall('agent', value)).toBeNull()
  })
})

describe('isAgentChatRequest', () => {
  it('requires mode and approval mode and validates structured messages', () => {
    const request = {
      configId: 'config-1',
      mode: 'agent',
      approvalMode: 'request',
      messages: [
        { role: 'user', content: 'Prepare a safe edit' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call-1', name: 'get_editor_context', arguments: {} }]
        },
        {
          role: 'tool',
          content: JSON.stringify({
            success: true,
            code: 'OK',
            message: 'Context loaded',
            changed: false,
            affectedClipIds: []
          }),
          toolCallId: 'call-1',
          name: 'get_editor_context'
        }
      ]
    }

    expect(isAgentChatRequest(request)).toBe(true)
    expect(
      isAgentChatRequest({
        ...request,
        messages: [
          request.messages[0],
          request.messages[1],
          { ...request.messages[2], toolCallId: 'different-call' }
        ]
      })
    ).toBe(false)
    expect(isAgentChatRequest({ ...request, mode: undefined })).toBe(false)
    expect(isAgentChatRequest({ ...request, approvalMode: undefined })).toBe(false)
    expect(isAgentChatRequest({ ...request, approvalMode: 'always' })).toBe(false)
    expect(isAgentChatRequest({ ...request, unexpected: true })).toBe(false)
  })

  it('rejects plans in assistant requests and enforces message limits', () => {
    const request = {
      configId: 'config-1',
      mode: 'assistant',
      approvalMode: 'smart',
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            { id: 'call-1', name: 'propose_editor_plan', arguments: { plan: validPlan } }
          ]
        }
      ]
    }

    expect(isAgentChatRequest(request)).toBe(false)
    expect(
      isAgentChatRequest({
        ...request,
        mode: 'agent',
        messages: Array.from({ length: 61 }, () => ({ role: 'user', content: 'hello' }))
      })
    ).toBe(false)
    expect(
      isAgentChatRequest({
        ...request,
        mode: 'agent',
        messages: [{ role: 'user', content: 'x'.repeat(20_001) }]
      })
    ).toBe(false)
  })
})

describe('isAgentToolExecutionResult', () => {
  it('accepts a structured result and rejects malformed results', () => {
    expect(
      isAgentToolExecutionResult({
        success: false,
        code: 'AWAITING_APPROVAL',
        message: 'Approval required',
        changed: false,
        affectedClipIds: [' clip-a ', 'clip-a'],
        data: { planId: 'plan-1' }
      })
    ).toBe(true)

    expect(
      isAgentToolExecutionResult({
        success: false,
        code: 'UNKNOWN',
        message: 'No',
        changed: false,
        affectedClipIds: []
      })
    ).toBe(false)
    expect(
      isAgentToolExecutionResult({
        success: true,
        code: 'OK',
        message: 'Changed',
        changed: true,
        affectedClipIds: Array.from({ length: 101 }, (_, index) => `clip-${index}`)
      })
    ).toBe(false)
    expect(
      isAgentToolExecutionResult({
        success: true,
        code: 'OK',
        message: 'Changed',
        changed: true,
        affectedClipIds: [],
        unexpected: true
      })
    ).toBe(false)
  })
})
