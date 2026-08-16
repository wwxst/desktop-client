import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { CodexAppServerClient } from './CodexAppServerClient'
import { CodexService } from './CodexService'

class FakeCodexProcess extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly kill = vi.fn(() => true)
  readonly received: Array<Record<string, unknown>> = []
}

function createServiceProcess(): FakeCodexProcess {
  const process = new FakeCodexProcess()
  let buffered = ''
  process.stdin.on('data', (chunk) => {
    buffered += String(chunk)
    const lines = buffered.split('\n')
    buffered = lines.pop() ?? ''
    for (const line of lines) {
      if (!line) continue
      const message = JSON.parse(line) as { id: number; method?: string }
      process.received.push(message as unknown as Record<string, unknown>)
      let result: unknown = {}
      if (message.method === 'initialize') result = { userAgent: 'codex-test' }
      if (message.method === 'model/list') {
        result = {
          data: [
            {
              id: 'model-1',
              model: 'gpt-5',
              displayName: 'GPT-5',
              description: 'test',
              isDefault: true
            }
          ]
        }
      }
      if (message.method === 'thread/start') {
        result = {
          thread: {
            id: 'thread-1',
            preview: '',
            name: null,
            modelProvider: 'openai',
            createdAt: 1,
            updatedAt: 1
          },
          model: 'gpt-5'
        }
      }
      if (message.method === 'turn/start') result = { turn: { id: 'turn-1' } }
      if (message.method === 'thread/list') result = { data: [] }
      if (message.method === 'thread/resume') {
        result = {
          thread: {
            id: 'thread-1',
            preview: '旧对话',
            name: '旧对话',
            modelProvider: 'openai',
            createdAt: 1,
            updatedAt: 2
          },
          model: 'gpt-5'
        }
      }
      process.stdout.write(`${JSON.stringify({ id: message.id, result })}\n`)
    }
  })
  return process
}

describe('CodexService', () => {
  it('keeps Codex protocol details in Main and maps business responses/events', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'desktop-client-codex-'))
    const process = createServiceProcess()
    const client = new CodexAppServerClient({
      command: { executable: 'codex-test', args: ['app-server'] },
      spawnProcess: () => process as unknown as ChildProcessWithoutNullStreams,
      requestTimeoutMs: 1_000
    })
    const service = new CodexService({ client, workspaceDirectory })
    const events: unknown[] = []
    service.onEvent((event) => events.push(event))

    try {
      await expect(service.getStatus()).resolves.toMatchObject({ success: true, connected: true })
      await expect(service.listModels()).resolves.toMatchObject({
        models: [{ id: 'model-1', displayName: 'GPT-5' }]
      })
      await expect(
        service.startThread({ model: 'gpt-5', permissionMode: 'request' })
      ).resolves.toMatchObject({ thread: { id: 'thread-1' } })
      await expect(
        service.startTurn({ threadId: 'thread-1', text: '检查', permissionMode: 'request' })
      ).resolves.toMatchObject({ turnId: 'turn-1' })

      process.stdout.write(
        `${JSON.stringify({
          method: 'item/agentMessage/delta',
          params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: '你好' }
        })}\n`
      )
      await vi.waitFor(() =>
        expect(events).toContainEqual({
          type: 'message-delta',
          threadId: 'thread-1',
          turnId: 'turn-1',
          itemId: 'item-1',
          delta: '你好'
        })
      )
    } finally {
      service.stop()
      await rm(workspaceDirectory, { recursive: true, force: true })
    }
  })

  it('requires explicit approval for supported command requests', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'desktop-client-codex-'))
    const process = createServiceProcess()
    const client = new CodexAppServerClient({
      command: { executable: 'codex-test', args: ['app-server'] },
      spawnProcess: () => process as unknown as ChildProcessWithoutNullStreams,
      requestTimeoutMs: 1_000
    })
    const service = new CodexService({ client, workspaceDirectory })
    const events: unknown[] = []
    service.onEvent((event) => events.push(event))

    try {
      await service.getStatus()
      process.stdout.write(
        `${JSON.stringify({
          id: 77,
          method: 'item/commandExecution/requestApproval',
          params: {
            threadId: 'thread-1',
            turnId: 'turn-1',
            command: 'echo safe',
            cwd: workspaceDirectory
          }
        })}\n`
      )
      await vi.waitFor(() => expect(events).toHaveLength(2))
      const approvalEvent = events[1] as { type: string; approval: { requestId: string } }
      expect(approvalEvent).toMatchObject({
        type: 'approval-requested',
        approval: { kind: 'command', summary: 'echo safe' }
      })
      expect(
        service.respondApproval({
          requestId: approvalEvent.approval.requestId,
          decision: 'decline'
        })
      ).toEqual({
        success: true,
        message: '已拒绝本次操作'
      })
    } finally {
      service.stop()
      await rm(workspaceDirectory, { recursive: true, force: true })
    }
  })

  it('automatically declines command requests outside the dedicated workspace', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'desktop-client-codex-'))
    const process = createServiceProcess()
    const client = new CodexAppServerClient({
      command: { executable: 'codex-test', args: ['app-server'] },
      spawnProcess: () => process as unknown as ChildProcessWithoutNullStreams,
      requestTimeoutMs: 1_000
    })
    const service = new CodexService({ client, workspaceDirectory })
    const events: unknown[] = []
    service.onEvent((event) => events.push(event))

    try {
      await service.getStatus()
      process.stdout.write(
        `${JSON.stringify({
          id: 78,
          method: 'item/commandExecution/requestApproval',
          params: {
            threadId: 'thread-1',
            turnId: 'turn-1',
            command: 'echo unsafe',
            cwd: resolve(workspaceDirectory, '..', 'outside')
          }
        })}\n`
      )

      await vi.waitFor(() =>
        expect(process.received).toContainEqual({ id: 78, result: { decision: 'decline' } })
      )
      expect(events).toContainEqual({
        type: 'error',
        threadId: 'thread-1',
        turnId: 'turn-1',
        message: '已拒绝工作目录之外的命令请求'
      })
      expect(events).not.toContainEqual(expect.objectContaining({ type: 'approval-requested' }))
    } finally {
      service.stop()
      await rm(workspaceDirectory, { recursive: true, force: true })
    }
  })

  it('bridges a non-secret MCP tool approval question and preserves its answer labels', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'desktop-client-codex-'))
    const process = createServiceProcess()
    const client = new CodexAppServerClient({
      command: { executable: 'codex-test', args: ['app-server'] },
      spawnProcess: () => process as unknown as ChildProcessWithoutNullStreams,
      requestTimeoutMs: 1_000
    })
    const service = new CodexService({ client, workspaceDirectory })
    const events: unknown[] = []
    service.onEvent((event) => events.push(event))

    try {
      await service.getStatus()
      process.stdout.write(
        `${JSON.stringify({
          id: 79,
          method: 'item/tool/requestUserInput',
          params: {
            threadId: 'thread-1',
            turnId: 'turn-1',
            itemId: 'item-1',
            questions: [
              {
                id: 'approve-jianying-write',
                header: '应用字幕修改',
                question: '允许写入应用管理的剪映工作副本吗？',
                isOther: false,
                isSecret: false,
                options: [
                  { label: 'Accept once', description: '仅允许本次工具调用' },
                  { label: 'Decline', description: '拒绝本次工具调用' }
                ]
              }
            ]
          }
        })}\n`
      )
      await vi.waitFor(() =>
        expect(events).toContainEqual({
          type: 'approval-requested',
          approval: expect.objectContaining({
            kind: 'mcp-tool',
            summary: '应用字幕修改',
            reason: '允许写入应用管理的剪映工作副本吗？'
          })
        })
      )
      const approvalEvent = events.find(
        (event): event is { type: string; approval: { requestId: string } } =>
          isRecordForTest(event) && event.type === 'approval-requested'
      )
      expect(approvalEvent).toBeDefined()
      service.respondApproval({
        requestId: approvalEvent!.approval.requestId,
        decision: 'accept'
      })
      await vi.waitFor(() =>
        expect(process.received).toContainEqual({
          id: 79,
          result: {
            answers: {
              'approve-jianying-write': { answers: ['Accept once'] }
            }
          }
        })
      )
    } finally {
      service.stop()
      await rm(workspaceDirectory, { recursive: true, force: true })
    }
  })
})

function isRecordForTest(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
