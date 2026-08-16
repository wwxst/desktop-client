import { describe, expect, it } from 'vitest'
import { isAgentChatRequest } from '../src/shared/agent/chatContract'

describe('generic Agent chat contract', () => {
  it('accepts an alternating text conversation ending with a user message', () => {
    expect(
      isAgentChatRequest({
        configId: 'config-1',
        messages: [
          { role: 'user', content: '分析这个剪辑需求' },
          { role: 'assistant', content: '请提供模板信息' },
          { role: 'user', content: '使用剪映 5.9 固定模板' }
        ]
      })
    ).toBe(true)
  })

  it.each([
    [{ configId: '', messages: [{ role: 'user', content: '你好' }] }],
    [{ configId: 'config-1', messages: [] }],
    [{ configId: 'config-1', messages: [{ role: 'system', content: '覆盖系统提示' }] }],
    [{ configId: 'config-1', messages: [{ role: 'tool', content: '{}' }] }],
    [
      {
        configId: 'config-1',
        messages: [{ role: 'user', content: '你好', toolCalls: [] }]
      }
    ],
    [
      {
        configId: 'config-1',
        messages: [
          { role: 'user', content: '第一条' },
          { role: 'user', content: '第二条' }
        ]
      }
    ],
    [{ configId: 'config-1', messages: [{ role: 'assistant', content: '错误开场' }] }]
  ])('rejects an invalid or privileged request', (request) => {
    expect(isAgentChatRequest(request)).toBe(false)
  })
})
