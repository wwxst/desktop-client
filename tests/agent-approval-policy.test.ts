import { describe, expect, it } from 'vitest'
import type { AgentEditorPlan } from '../src/shared/agent/workflow'
import { decideAgentPlanApproval } from '../src/renderer/src/components/AiPanel/agentApprovalPolicy'

const singleMove: AgentEditorPlan = {
  planId: 'plan-1',
  projectRevision: 1,
  summary: 'Move clip',
  actions: [{ type: 'clip.move', clipId: 'clip-1', timelineStart: 2 }]
}

describe('Agent approval policy', () => {
  it('rejects every modification plan in Assistant mode', () => {
    expect(decideAgentPlanApproval('assistant', 'full', singleMove)).toBe('reject')
  })

  it('requires approval for all plans in request mode', () => {
    expect(decideAgentPlanApproval('agent', 'request', singleMove)).toBe('require_approval')
  })

  it.each<AgentEditorPlan['actions'][number]>([
    { type: 'clip.split', clipId: 'clip-1', at: 1 },
    { type: 'clip.move', clipId: 'clip-1', timelineStart: 2 },
    { type: 'clip.update', clipId: 'clip-1', patch: { opacity: 0.5 } }
  ])('auto executes one smart low-risk action', (action) => {
    expect(decideAgentPlanApproval('agent', 'smart', { ...singleMove, actions: [action] })).toBe(
      'auto_execute'
    )
  })

  it('requires approval for deletes and multi-action plans in smart mode', () => {
    expect(
      decideAgentPlanApproval('agent', 'smart', {
        ...singleMove,
        actions: [{ type: 'clip.delete', clipIds: ['clip-1'] }]
      })
    ).toBe('require_approval')
    expect(
      decideAgentPlanApproval('agent', 'smart', {
        ...singleMove,
        actions: [singleMove.actions[0], { type: 'clip.move', clipId: 'clip-2', timelineStart: 3 }]
      })
    ).toBe('require_approval')
  })

  it('auto executes allowlisted plans in full mode', () => {
    expect(
      decideAgentPlanApproval('agent', 'full', {
        ...singleMove,
        actions: [{ type: 'clip.delete', clipIds: ['clip-1'] }]
      })
    ).toBe('auto_execute')
    expect(
      decideAgentPlanApproval('agent', 'full', {
        ...singleMove,
        actions: [
          { type: 'clip.split', clipId: 'clip-1', at: 1 },
          { type: 'clip.update', clipId: 'clip-2', patch: { muted: true } }
        ]
      })
    ).toBe('auto_execute')
  })
})
