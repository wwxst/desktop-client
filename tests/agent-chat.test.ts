import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentApprovalMode, AgentChatMode } from '../src/shared/agent/workflow'
import { findInternalModelProvider } from '../src/main/agent/modelCatalog'
import { ModelGateway } from '../src/main/agent/runtime/ModelGateway'
import { ModelRegistry } from '../src/main/agent/runtime/ModelRegistry'

afterEach(() => vi.unstubAllGlobals())

function createGatewayReturning(
  message: Record<string, unknown>,
  mode: AgentChatMode = 'agent',
  approvalMode: AgentApprovalMode = 'request'
) {
  const registry = new ModelRegistry(findInternalModelProvider, () => 'config-1')
  registry.create({
    kind: 'custom',
    baseUrl: 'https://gateway.example.test/v1',
    modelId: 'chat-model',
    apiKey: 'secret'
  })
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ choices: [{ message }] })
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    gateway: new ModelGateway(registry),
    fetchMock,
    run: () =>
      new ModelGateway(registry).chat(
        'config-1',
        [{ role: 'user', content: '整理时间线' }],
        mode,
        approvalMode
      )
  }
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>
}

describe('Agent chat model gateway', () => {
  it('exposes only the read tool and a read-only prompt in Assistant mode', async () => {
    const { gateway, fetchMock } = createGatewayReturning({ content: '工程有 3 个片段' })

    await gateway.chat(
      'config-1',
      [{ role: 'user', content: '工程里有什么？' }],
      'assistant',
      'full'
    )

    const body = requestBody(fetchMock) as {
      messages: Array<{ role: string; content: string }>
      tools: Array<{ function: { name: string } }>
    }
    expect(body.tools.map((tool) => tool.function.name)).toEqual(['get_editor_context'])
    expect(body.messages[0].content).toContain('不能修改工程')
  })

  it('exposes read and structured plan tools in Agent mode', async () => {
    const { gateway, fetchMock } = createGatewayReturning({ content: '准备规划' })

    await gateway.chat('config-1', [{ role: 'user', content: '整理时间线' }], 'agent', 'request')

    const body = requestBody(fetchMock) as {
      messages: Array<{ role: string; content: string }>
      tools: Array<{ function: { name: string; parameters: Record<string, unknown> } }>
    }
    expect(body.tools.map((tool) => tool.function.name)).toEqual([
      'get_editor_context',
      'propose_editor_plan'
    ])
    expect(body.messages[0].content).toContain('projectRevision')
    expect(body.messages[0].content).toContain('propose_editor_plan')
    expect(body.messages[0].content).toContain('请求批准')
    expect(body.tools[1].function.parameters).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        actions: { minItems: 1, maxItems: 20, items: { oneOf: expect.any(Array) } }
      }
    })
  })

  it('parses a valid structured editor plan', async () => {
    const { run } = createGatewayReturning({
      content: null,
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'propose_editor_plan',
            arguments: JSON.stringify({
              planId: 'plan-1',
              projectRevision: 4,
              summary: '整理两个片段',
              actions: [
                { type: 'clip.move', clipId: 'clip-1', timelineStart: 2 },
                { type: 'clip.update', clipId: 'clip-2', patch: { volume: 0.8 } }
              ]
            })
          }
        }
      ]
    })

    await expect(run()).resolves.toEqual({
      content: '',
      toolCalls: [
        {
          id: 'call-1',
          name: 'propose_editor_plan',
          arguments: {
            planId: 'plan-1',
            projectRevision: 4,
            summary: '整理两个片段',
            actions: [
              { type: 'clip.move', clipId: 'clip-1', timelineStart: 2 },
              { type: 'clip.update', clipId: 'clip-2', patch: { volume: 0.8 } }
            ]
          }
        }
      ]
    })
  })

  it('rejects a forged plan tool call in Assistant mode', async () => {
    const { gateway } = createGatewayReturning({
      content: null,
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'propose_editor_plan',
            arguments: JSON.stringify({
              planId: 'plan-1',
              projectRevision: 0,
              summary: '删除片段',
              actions: [{ type: 'clip.delete', clipIds: ['clip-1'] }]
            })
          }
        }
      ]
    })

    await expect(
      gateway.chat('config-1', [{ role: 'user', content: '删除片段' }], 'assistant', 'request')
    ).rejects.toThrow('Editor plans are not allowed in assistant mode')
  })

  it('rejects unknown plan fields through the shared validator', async () => {
    const { run } = createGatewayReturning({
      content: null,
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'propose_editor_plan',
            arguments: JSON.stringify({
              planId: 'plan-1',
              projectRevision: 0,
              summary: '移动片段',
              actions: [{ type: 'clip.move', clipId: 'clip-1', timelineStart: 2, command: 'raw' }]
            })
          }
        }
      ]
    })

    await expect(run()).rejects.toThrow('Invalid Agent editor plan')
  })

  it('rejects legacy direct-edit tool calls', async () => {
    const { run } = createGatewayReturning({
      content: null,
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'delete_selected_clips', arguments: '{}' }
        }
      ]
    })

    await expect(run()).rejects.toThrow('Unsupported Agent tool: delete_selected_clips')
  })

  it('rejects malformed JSON tool arguments', async () => {
    const { run } = createGatewayReturning({
      content: null,
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'get_editor_context', arguments: '{' }
        }
      ]
    })

    await expect(run()).rejects.toThrow('工具 get_editor_context 的参数不是有效 JSON')
  })

  it('rejects a missing explicit model configuration', async () => {
    const gateway = new ModelGateway(new ModelRegistry(findInternalModelProvider))

    await expect(
      gateway.chat('', [{ role: 'user', content: '你好' }], 'agent', 'request')
    ).rejects.toThrow('请选择模型配置')
  })
})
