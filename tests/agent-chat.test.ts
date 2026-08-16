import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelGateway } from '../src/main/agent/runtime/ModelGateway'
import { ModelRegistry } from '../src/main/agent/runtime/ModelRegistry'

afterEach(() => vi.unstubAllGlobals())

function createGateway(): { gateway: ModelGateway; configId: string } {
  const registry = new ModelRegistry()
  const configuration = registry.create({
    kind: 'custom',
    baseUrl: 'https://gateway.example.test/v1',
    modelId: 'chat-model',
    apiKey: 'secret'
  })
  return { gateway: new ModelGateway(registry), configId: configuration.id }
}

describe('generic Agent chat gateway', () => {
  it('sends text-only messages without tools or editor instructions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: '可以先校验剪映版本和模板。' } }]
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { gateway, configId } = createGateway()

    await expect(
      gateway.chat(configId, [{ role: 'user', content: '帮我规划批量剪辑流程' }])
    ).resolves.toEqual({ content: '可以先校验剪映版本和模板。' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>
    expect(body).not.toHaveProperty('tools')
    expect(body).not.toHaveProperty('tool_choice')
    expect(JSON.stringify(body)).not.toContain('get_editor_context')
    expect(JSON.stringify(body)).not.toContain('propose_editor_plan')
    expect(body.messages).toEqual([
      {
        role: 'system',
        content: expect.stringContaining('当前对话没有剪映、文件系统或桌面操作工具')
      },
      { role: 'user', content: '帮我规划批量剪辑流程' }
    ])
  })

  it('rejects tool calls until a dedicated execution contract exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: '正在执行',
                tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'click' } }]
              }
            }
          ]
        })
      })
    )
    const { gateway, configId } = createGateway()

    await expect(gateway.chat(configId, [{ role: 'user', content: '执行任务' }])).rejects.toThrow(
      '当前通用对话不支持工具调用'
    )
  })
})
