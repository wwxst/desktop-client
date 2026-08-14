import type {
  AgentApprovalMode,
  AgentChatMode,
  AgentEditorPlan,
  AgentEditorPlanAction
} from '../../../../shared/agent/workflow'

export type AgentPlanApprovalDecision = 'auto_execute' | 'require_approval' | 'reject'

const ALLOWLISTED_ACTION_TYPES = new Set<AgentEditorPlanAction['type']>([
  'clip.delete',
  'clip.split',
  'clip.move',
  'clip.update'
])

const SMART_AUTO_EXECUTE_ACTION_TYPES = new Set<AgentEditorPlanAction['type']>([
  'clip.split',
  'clip.move',
  'clip.update'
])

export function decideAgentPlanApproval(
  mode: AgentChatMode,
  approvalMode: AgentApprovalMode,
  plan: AgentEditorPlan
): AgentPlanApprovalDecision {
  if (mode === 'assistant') return 'reject'
  if (
    plan.actions.length === 0 ||
    !plan.actions.every((action) => ALLOWLISTED_ACTION_TYPES.has(action.type))
  ) {
    return 'reject'
  }
  if (approvalMode === 'request') return 'require_approval'
  if (approvalMode === 'full') return 'auto_execute'
  if (plan.actions.length === 1 && SMART_AUTO_EXECUTE_ACTION_TYPES.has(plan.actions[0].type)) {
    return 'auto_execute'
  }
  return 'require_approval'
}
