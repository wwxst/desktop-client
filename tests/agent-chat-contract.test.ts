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

function planCall(plan: unknown = validPlan, id = 'call-1'): unknown {
  return { id, name: 'propose_editor_plan', arguments: plan }
}

function planWithAction(action: unknown): unknown {
  return planCall({ ...validPlan, actions: [action] })
}

describe('parseAgentToolCall', () => {
  it('normalizes every structured plan action in agent mode', () => {
    expect(parseAgentToolCall('agent', planCall())).toEqual({
      id: 'call-1',
      name: 'propose_editor_plan',
      arguments: {
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
    })
  })

  it('accepts context reads in assistant mode and throws for plans', () => {
    expect(
      parseAgentToolCall('assistant', {
        id: 'context-1',
        name: 'get_editor_context',
        arguments: {}
      })
    ).toEqual({ id: 'context-1', name: 'get_editor_context', arguments: {} })
    expect(() => parseAgentToolCall('assistant', planCall())).toThrow(
      'Editor plans are not allowed in assistant mode'
    )
  })

  it.each([
    ...['delete_selected_clips', 'split_selected_clip'].map((name) => [
      `legacy tool ${name}`,
      { id: 'call', name, arguments: {} },
      'Unsupported Agent tool'
    ]),
    ['unknown tool', { id: 'call', name: 'unknown', arguments: {} }, 'Unsupported Agent tool'],
    [
      'unknown call key',
      { id: 'call', name: 'get_editor_context', arguments: {}, executable: true },
      'Invalid Agent tool call'
    ],
    ['unknown plan key', planCall({ ...validPlan, executable: true }), 'Invalid Agent editor plan'],
    [
      'negative revision',
      planCall({ ...validPlan, projectRevision: -1 }),
      'Invalid Agent editor plan'
    ],
    [
      'fractional revision',
      planCall({ ...validPlan, projectRevision: 1.5 }),
      'Invalid Agent editor plan'
    ],
    [
      'arbitrary update field',
      planWithAction({ type: 'clip.update', clipId: 'clip', patch: { arbitrary: true } }),
      'Invalid Agent editor plan'
    ],
    [
      'empty transform',
      planWithAction({ type: 'clip.update', clipId: 'clip', patch: { transform: {} } }),
      'Invalid Agent editor plan'
    ],
    [
      '21 actions',
      planCall({
        ...validPlan,
        actions: Array.from({ length: 21 }, (_, index) => ({
          type: 'clip.split',
          clipId: `clip-${index}`,
          at: index
        }))
      }),
      'Invalid Agent editor plan'
    ]
  ])('throws a stable error for %s', (_label, value, message) => {
    expect(() => parseAgentToolCall('agent', value)).toThrow(message)
  })

  it('accepts 200-character IDs and rejects 201-character IDs', () => {
    expect(parseAgentToolCall('agent', planCall(validPlan, 'x'.repeat(200))).id).toHaveLength(200)
    expect(() => parseAgentToolCall('agent', planCall(validPlan, 'x'.repeat(201)))).toThrow(
      'Invalid Agent tool call'
    )
    expect(
      parseAgentToolCall('agent', planCall({ ...validPlan, planId: 'p'.repeat(200) })).arguments
    ).toMatchObject({ planId: 'p'.repeat(200) })
    expect(() =>
      parseAgentToolCall('agent', planCall({ ...validPlan, planId: 'p'.repeat(201) }))
    ).toThrow('Invalid Agent editor plan')
  })

  it('accepts a 2000-character summary and rejects 2001 characters', () => {
    expect(
      parseAgentToolCall('agent', planCall({ ...validPlan, summary: 's'.repeat(2_000) })).arguments
    ).toMatchObject({ summary: 's'.repeat(2_000) })
    expect(() =>
      parseAgentToolCall('agent', planCall({ ...validPlan, summary: 's'.repeat(2_001) }))
    ).toThrow('Invalid Agent editor plan')
  })

  it.each([
    ['split at', (value: number) => ({ type: 'clip.split', clipId: 'clip', at: value }), 0, 86_400],
    [
      'move timelineStart',
      (value: number) => ({ type: 'clip.move', clipId: 'clip', timelineStart: value }),
      0,
      86_400
    ],
    [
      'opacity',
      (value: number) => ({ type: 'clip.update', clipId: 'clip', patch: { opacity: value } }),
      0,
      1
    ],
    [
      'volume',
      (value: number) => ({ type: 'clip.update', clipId: 'clip', patch: { volume: value } }),
      0,
      1
    ],
    [
      'speed',
      (value: number) => ({ type: 'clip.update', clipId: 'clip', patch: { speed: value } }),
      0.1,
      8
    ],
    [
      'transform x',
      (value: number) => ({
        type: 'clip.update',
        clipId: 'clip',
        patch: { transform: { x: value } }
      }),
      -100_000,
      100_000
    ],
    [
      'transform y',
      (value: number) => ({
        type: 'clip.update',
        clipId: 'clip',
        patch: { transform: { y: value } }
      }),
      -100_000,
      100_000
    ],
    [
      'transform scaleX',
      (value: number) => ({
        type: 'clip.update',
        clipId: 'clip',
        patch: { transform: { scaleX: value } }
      }),
      0.01,
      100
    ],
    [
      'transform scaleY',
      (value: number) => ({
        type: 'clip.update',
        clipId: 'clip',
        patch: { transform: { scaleY: value } }
      }),
      0.01,
      100
    ],
    [
      'transform rotation',
      (value: number) => ({
        type: 'clip.update',
        clipId: 'clip',
        patch: { transform: { rotation: value } }
      }),
      -36_000,
      36_000
    ]
  ])('enforces finite %s boundaries', (_label, action, min, max) => {
    expect(() => parseAgentToolCall('agent', planWithAction(action(min)))).not.toThrow()
    expect(() => parseAgentToolCall('agent', planWithAction(action(max)))).not.toThrow()
    expect(() => parseAgentToolCall('agent', planWithAction(action(min - 0.01)))).toThrow(
      'Invalid Agent editor plan'
    )
    expect(() => parseAgentToolCall('agent', planWithAction(action(max + 0.01)))).toThrow(
      'Invalid Agent editor plan'
    )
    expect(() => parseAgentToolCall('agent', planWithAction(action(Infinity)))).toThrow(
      'Invalid Agent editor plan'
    )
    expect(() => parseAgentToolCall('agent', planWithAction(action(Number.NaN)))).toThrow(
      'Invalid Agent editor plan'
    )
  })
})

describe('isAgentChatRequest', () => {
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

  it('requires mode and approval mode and validates paired tool results', () => {
    expect(isAgentChatRequest(request)).toBe(true)
    expect(isAgentChatRequest({ ...request, mode: undefined })).toBe(false)
    expect(isAgentChatRequest({ ...request, approvalMode: undefined })).toBe(false)
    expect(isAgentChatRequest({ ...request, approvalMode: 'always' })).toBe(false)
    expect(isAgentChatRequest({ ...request, unexpected: true })).toBe(false)
    expect(
      isAgentChatRequest({
        ...request,
        messages: [
          request.messages[0],
          request.messages[1],
          { ...request.messages[2], toolCallId: 'other' }
        ]
      })
    ).toBe(false)
  })

  it('rejects plans in assistant requests and enforces message limits', () => {
    expect(
      isAgentChatRequest({
        configId: 'config-1',
        mode: 'assistant',
        approvalMode: 'smart',
        messages: [{ role: 'assistant', content: '', toolCalls: [planCall()] }]
      })
    ).toBe(false)
    expect(
      isAgentChatRequest({
        ...request,
        messages: Array.from({ length: 61 }, () => ({ role: 'user', content: 'hello' }))
      })
    ).toBe(false)
    expect(
      isAgentChatRequest({ ...request, messages: [{ role: 'user', content: 'x'.repeat(20_001) }] })
    ).toBe(false)
  })
})

describe('isAgentToolExecutionResult', () => {
  it.each([
    'OK',
    'AWAITING_APPROVAL',
    'REJECTED',
    'STALE_CONTEXT',
    'INVALID_PLAN',
    'UNSUPPORTED_ACTION',
    'EDITOR_UNAVAILABLE',
    'EXECUTION_FAILED'
  ])('accepts the %s result code', (code) => {
    expect(
      isAgentToolExecutionResult({
        success: code === 'OK',
        code,
        message: 'Structured result',
        changed: false,
        affectedClipIds: [' clip-a ', 'clip-a'],
        data: { planId: 'plan-1' }
      })
    ).toBe(true)
  })

  it('rejects unknown codes, excessive clip IDs, and unknown keys', () => {
    const result = {
      success: true,
      code: 'OK',
      message: 'Changed',
      changed: true,
      affectedClipIds: []
    }
    expect(isAgentToolExecutionResult({ ...result, code: 'UNKNOWN' })).toBe(false)
    expect(
      isAgentToolExecutionResult({
        ...result,
        affectedClipIds: Array.from({ length: 101 }, (_, index) => `clip-${index}`)
      })
    ).toBe(false)
    expect(isAgentToolExecutionResult({ ...result, unexpected: true })).toBe(false)
  })
})
