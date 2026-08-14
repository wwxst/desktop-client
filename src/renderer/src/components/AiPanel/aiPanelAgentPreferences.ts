import type { AgentApprovalMode, AgentChatMode } from '../../../../shared/agent/workflow'

export const AI_EXECUTION_MODE_KEY = 'desktop-client.ai.execution-mode'
export const AI_APPROVAL_MODE_KEY = 'desktop-client.ai.approval-mode'

export function readAiExecutionMode(storage?: Storage): AgentChatMode {
  try {
    const value = (storage ?? window.localStorage).getItem(AI_EXECUTION_MODE_KEY)
    return value === 'assistant' ? 'assistant' : 'agent'
  } catch {
    return 'agent'
  }
}

export function writeAiExecutionMode(mode: AgentChatMode, storage?: Storage): void {
  try {
    const target = storage ?? window.localStorage
    target.setItem(AI_EXECUTION_MODE_KEY, mode)
  } catch {
    // The in-memory selection remains usable when persistent storage is unavailable.
  }
}

export function readAiApprovalMode(storage?: Storage): AgentApprovalMode {
  try {
    const value = (storage ?? window.localStorage).getItem(AI_APPROVAL_MODE_KEY)
    return value === 'smart' || value === 'full' ? value : 'request'
  } catch {
    return 'request'
  }
}

export function writeAiApprovalMode(mode: AgentApprovalMode, storage?: Storage): void {
  try {
    const target = storage ?? window.localStorage
    target.setItem(AI_APPROVAL_MODE_KEY, mode)
  } catch {
    // The in-memory selection remains usable when persistent storage is unavailable.
  }
}
