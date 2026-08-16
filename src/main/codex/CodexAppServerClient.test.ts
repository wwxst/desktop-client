import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexAppServerClient, resolveCodexCommand } from './CodexAppServerClient'

afterEach(() => vi.unstubAllEnvs())

class FakeCodexProcess extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly kill = vi.fn(() => true)
}

interface ClientFixture {
  client: CodexAppServerClient
  process: FakeCodexProcess
  received: Array<Record<string, unknown>>
}

function createClient(): ClientFixture {
  const process = new FakeCodexProcess()
  const received: Array<Record<string, unknown>> = []
  let buffered = ''
  process.stdin.on('data', (chunk) => {
    buffered += String(chunk)
    const lines = buffered.split('\n')
    buffered = lines.pop() ?? ''
    for (const line of lines) {
      if (!line) continue
      const message = JSON.parse(line) as Record<string, unknown>
      received.push(message)
      if (message.method === 'initialize') {
        process.stdout.write(
          `${JSON.stringify({ id: message.id, result: { userAgent: 'codex-test' } })}\n`
        )
      }
      if (message.method === 'model/list') {
        process.stdout.write(`${JSON.stringify({ id: message.id, result: { data: [] } })}\n`)
      }
    }
  })
  const client = new CodexAppServerClient({
    command: { executable: 'codex-test', args: ['app-server'] },
    spawnProcess: () => process as unknown as ChildProcessWithoutNullStreams,
    requestTimeoutMs: 1_000
  })
  return { client, process, received }
}

describe('CodexAppServerClient', () => {
  it('preserves process-level MCP config overrides in the app-server command', () => {
    vi.stubEnv('CODEX_BIN', 'C:\\tools\\codex.exe')
    const override = 'mcp_servers.jianying={ enabled = true }'

    expect(resolveCodexCommand(['-c', override])).toEqual({
      executable: 'C:\\tools\\codex.exe',
      args: ['app-server', '--listen', 'stdio://', '-c', override]
    })
  })

  it('initializes once and resolves JSON-RPC requests', async () => {
    const { client, received } = createClient()

    await client.start()
    const result = await client.request('model/list', { includeHidden: false })

    expect(client.initializedUserAgent).toBe('codex-test')
    expect(result).toEqual({ data: [] })
    expect(received.filter((message) => message.method === 'initialize')).toHaveLength(1)
    expect(received).toContainEqual({ method: 'initialized' })
  })

  it('routes notifications and server requests without exposing the transport', async () => {
    const { client, process, received } = createClient()
    const notification = vi.fn()
    const serverRequest = vi.fn((request) => client.respond(request.id, { decision: 'decline' }))
    client.onNotification(notification)
    client.onRequest(serverRequest)
    await client.start()

    process.stdout.write(
      `${JSON.stringify({ method: 'turn/started', params: { threadId: 'thread-1' } })}\n`
    )
    process.stdout.write(
      `${JSON.stringify({
        id: 'approval-request',
        method: 'item/commandExecution/requestApproval',
        params: { threadId: 'thread-1', turnId: 'turn-1' }
      })}\n`
    )

    await vi.waitFor(() => expect(notification).toHaveBeenCalledOnce())
    expect(serverRequest).toHaveBeenCalledOnce()
    expect(received).toContainEqual({ id: 'approval-request', result: { decision: 'decline' } })
  })

  it('rejects an in-flight request when the process exits', async () => {
    const { client, process, received } = createClient()
    await client.start()

    const pending = client.request('thread/list', {})
    await vi.waitFor(() =>
      expect(received.some((message) => message.method === 'thread/list')).toBe(true)
    )
    process.emit('exit', 1, null)

    await expect(pending).rejects.toThrow('Codex App Server 已退出')
  })
})
