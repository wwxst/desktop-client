export const LAST_USED_AGENT_MODEL_CONFIG_KEY = 'desktop-client.ai.last-used-model-config-id'

interface ModelConfigurationIdentity {
  id: string
}

export function resolveAgentModelConfigId(
  configurations: readonly ModelConfigurationIdentity[],
  currentConfigId: string,
  lastUsedConfigId: string
): string {
  if (configurations.some(({ id }) => id === currentConfigId)) return currentConfigId
  if (configurations.some(({ id }) => id === lastUsedConfigId)) return lastUsedConfigId
  return configurations[0]?.id ?? ''
}

export function readLastUsedAgentModelConfigId(storage: Storage = window.localStorage): string {
  try {
    return storage.getItem(LAST_USED_AGENT_MODEL_CONFIG_KEY) ?? ''
  } catch {
    return ''
  }
}

export function writeLastUsedAgentModelConfigId(
  configId: string,
  storage: Storage = window.localStorage
): void {
  try {
    if (configId) storage.setItem(LAST_USED_AGENT_MODEL_CONFIG_KEY, configId)
    else storage.removeItem(LAST_USED_AGENT_MODEL_CONFIG_KEY)
  } catch {
    // The current selection remains usable when persistent storage is unavailable.
  }
}
