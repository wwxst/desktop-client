export type AgentPermissionMode = 'request' | 'smart' | 'full'

export const AGENT_PERMISSION_MODE_KEY = 'desktop-client.ai.agent-permission-mode'
export const DEFAULT_AGENT_PERMISSION_MODE: AgentPermissionMode = 'request'

export function readAgentPermissionMode(
  storage: Storage = window.localStorage
): AgentPermissionMode {
  try {
    const value = storage.getItem(AGENT_PERMISSION_MODE_KEY)
    return value === 'request' || value === 'smart' || value === 'full'
      ? value
      : DEFAULT_AGENT_PERMISSION_MODE
  } catch {
    return DEFAULT_AGENT_PERMISSION_MODE
  }
}

export function writeAgentPermissionMode(
  mode: AgentPermissionMode,
  storage: Storage = window.localStorage
): void {
  try {
    storage.setItem(AGENT_PERMISSION_MODE_KEY, mode)
  } catch {
    // The active permission remains usable when persistent storage is unavailable.
  }
}
