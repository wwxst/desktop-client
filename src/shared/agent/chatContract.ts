import type { AgentChatMessage, AgentChatRequest } from './workflow'

const MAX_CONFIG_ID_LENGTH = 200
const MAX_MESSAGE_CONTENT_LENGTH = 20_000
const MAX_MESSAGES = 60

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, required: readonly string[]): boolean {
  const keys = Object.keys(value)
  return required.every((key) => key in value) && keys.every((key) => required.includes(key))
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function isChatMessage(value: unknown): value is AgentChatMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['role', 'content']) &&
    (value.role === 'user' || value.role === 'assistant') &&
    isNonEmptyString(value.content, MAX_MESSAGE_CONTENT_LENGTH)
  )
}

export function isAgentChatRequest(value: unknown): value is AgentChatRequest {
  if (!isRecord(value) || !hasExactKeys(value, ['configId', 'messages'])) return false
  if (!isNonEmptyString(value.configId, MAX_CONFIG_ID_LENGTH)) return false
  const messages = value.messages
  if (!Array.isArray(messages) || messages.length === 0) return false
  if (messages.length > MAX_MESSAGES || !messages.every(isChatMessage)) return false
  if (messages[0].role !== 'user' || messages.at(-1)?.role !== 'user') return false

  return messages.every(
    (message, index) => index === 0 || message.role !== messages[index - 1].role
  )
}
