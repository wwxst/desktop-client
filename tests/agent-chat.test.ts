import { afterEach, describe, expect, it, vi } from 'vitest'
import { findInternalModelProvider } from '../src/main/agent/modelCatalog'
import { ModelGateway } from '../src/main/agent/runtime/ModelGateway'
import { ModelRegistry } from '../src/main/agent/runtime/ModelRegistry'

afterEach(() => vi.unstubAllGlobals())

describe('Agent chat model gateway', () => {
  it('sends allowlisted tools and parses structured tool calls', async () => {
    const registry = new ModelRegistry(findInternalModelProvider, () => 'config-1')
    registry.create({
      kind: 'custom',
      baseUrl: 'https://gateway.example.test/v1',
      modelId: 'chat-model',
      apiKey: 'secret'
    })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: { name: 'get_editor_context', arguments: '{}' }
                }
              ]
            }
          }
        ]
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await new ModelGateway(registry).chat('config-1', [
      { role: 'user', content: '当前工程里有什么？' }
    ])

    expect(response).toEqual({
      content: '',
      toolCalls: [{ id: 'call-1', name: 'get_editor_context', arguments: {} }]
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      model: 'chat-model',
      messages: expect.arrayContaining([{ role: 'user', content: '当前工程里有什么？' }]),
      tools: expect.arrayContaining([
        expect.objectContaining({
          type: 'function',
          function: expect.objectContaining({ name: 'get_editor_context' })
        })
      ])
    })
  })

  it('rejects a missing explicit model configuration', async () => {
    const gateway = new ModelGateway(new ModelRegistry(findInternalModelProvider))

    await expect(gateway.chat('', [{ role: 'user', content: '你好' }])).rejects.toThrow(
      '请选择模型配置'
    )
  })

  it('rejects model tool calls whose arguments do not match the allowlist schema', async () => {
    const registry = new ModelRegistry(findInternalModelProvider, () => 'config-1')
    registry.create({
      kind: 'custom',
      baseUrl: 'https://gateway.example.test/v1',
      modelId: 'chat-model',
      apiKey: 'secret'
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call-1',
                    type: 'function',
                    function: {
                      name: 'delete_selected_clips',
                      arguments: JSON.stringify({ magnetMainTrack: 'yes', command: 'arbitrary' })
                    }
                  }
                ]
              }
            }
          ]
        })
      })
    )

    await expect(
      new ModelGateway(registry).chat('config-1', [{ role: 'user', content: '删除选中片段' }])
    ).rejects.toThrow('工具 delete_selected_clips 的参数无效')
  })
})
