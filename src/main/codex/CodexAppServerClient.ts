import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createInterface, type Interface as ReadLineInterface } from 'node:readline'
import { join } from 'node:path'

type RequestId = string | number
type JsonObject = Record<string, unknown>

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

export interface CodexServerRequest {
  id: RequestId
  method: string
  params: unknown
}

export interface CodexServerNotification {
  method: string
  params: unknown
}

interface CodexCommand {
  executable: string
  args: string[]
}

export interface CodexAppServerClientOptions {
  command?: CodexCommand
  requestTimeoutMs?: number
  spawnProcess?: (executable: string, args: readonly string[]) => ChildProcessWithoutNullStreams
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(value: unknown): string {
  if (isRecord(value) && typeof value.message === 'string') return value.message
  return typeof value === 'string' ? value : 'Codex App Server 返回未知错误'
}

export function resolveCodexCommand(extraArgs: readonly string[] = []): CodexCommand {
  const explicit = process.env.CODEX_BIN?.trim()
  if (explicit) {
    return { executable: explicit, args: ['app-server', '--listen', 'stdio://', ...extraArgs] }
  }

  if (process.platform === 'win32') {
    const candidates = [
      join(process.resourcesPath, 'codex.exe'),
      process.env.APPDATA
        ? join(
            process.env.APPDATA,
            'npm',
            'node_modules',
            '@openai',
            'codex',
            'node_modules',
            '@openai',
            'codex-win32-x64',
            'vendor',
            'x86_64-pc-windows-msvc',
            'bin',
            'codex.exe'
          )
        : ''
    ].filter(Boolean)
    const executable = candidates.find((candidate) => existsSync(candidate))
    if (!executable) {
      throw new Error('未找到 Codex 可执行文件，请安装 Codex CLI 或设置 CODEX_BIN')
    }
    return { executable, args: ['app-server', '--listen', 'stdio://', ...extraArgs] }
  }

  return { executable: 'codex', args: ['app-server', '--listen', 'stdio://', ...extraArgs] }
}

export class CodexAppServerClient {
  private readonly command: CodexCommand
  private readonly requestTimeoutMs: number
  private readonly spawnProcess: NonNullable<CodexAppServerClientOptions['spawnProcess']>
  private readonly pending = new Map<RequestId, PendingRequest>()
  private readonly notificationListeners = new Set<(event: CodexServerNotification) => void>()
  private readonly requestListeners = new Set<(request: CodexServerRequest) => void>()
  private readonly statusListeners = new Set<(connected: boolean, message: string) => void>()
  private process: ChildProcessWithoutNullStreams | null = null
  private stdoutReader: ReadLineInterface | null = null
  private startPromise: Promise<void> | null = null
  private nextRequestId = 1
  private stopping = false
  private userAgent: string | undefined

  constructor(options: CodexAppServerClientOptions = {}) {
    this.command = options.command ?? resolveCodexCommand()
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    this.spawnProcess =
      options.spawnProcess ??
      ((executable, args) =>
        spawn(executable, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        }))
  }

  get connected(): boolean {
    return this.process !== null && this.startPromise !== null
  }

  get initializedUserAgent(): string | undefined {
    return this.userAgent
  }

  onNotification(listener: (event: CodexServerNotification) => void): () => void {
    this.notificationListeners.add(listener)
    return () => this.notificationListeners.delete(listener)
  }

  onRequest(listener: (request: CodexServerRequest) => void): () => void {
    this.requestListeners.add(listener)
    return () => this.requestListeners.delete(listener)
  }

  onStatus(listener: (connected: boolean, message: string) => void): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  async start(): Promise<void> {
    if (this.startPromise) return this.startPromise
    this.startPromise = this.startInternal().catch((error) => {
      this.startPromise = null
      this.disposeProcess()
      throw error
    })
    return this.startPromise
  }

  private async startInternal(): Promise<void> {
    this.stopping = false
    const child = this.spawnProcess(this.command.executable, this.command.args)
    this.process = child
    this.stdoutReader = createInterface({ input: child.stdout })
    this.stdoutReader.on('line', (line) => this.handleLine(line))
    child.stderr.on('data', (chunk: Buffer | string) => {
      const message = String(chunk).trim()
      if (message) console.warn('Codex App Server:', message)
    })
    child.once('error', (error) => this.handleDisconnect(child, error.message))
    child.once('exit', (code, signal) => {
      if (this.stopping) return
      const detail = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`
      this.handleDisconnect(child, `Codex App Server 已退出（${detail}）`)
    })

    const initialized = await this.requestConnected('initialize', {
      clientInfo: {
        name: 'desktop_client_video_agent',
        title: 'Desktop Video Agent',
        version: '1.0.0'
      },
      capabilities: {
        experimentalApi: false,
        requestAttestation: false
      }
    })
    if (isRecord(initialized) && typeof initialized.userAgent === 'string') {
      this.userAgent = initialized.userAgent
    }
    this.send({ method: 'initialized' })
    this.emitStatus(true, 'Codex App Server 已连接')
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    await this.start()
    return this.requestConnected(method, params)
  }

  respond(id: RequestId, result: unknown): void {
    this.send({ id, result })
  }

  respondError(id: RequestId, message: string, code = -32601): void {
    this.send({ id, error: { code, message } })
  }

  stop(): void {
    this.stopping = true
    this.rejectPending(new Error('Codex App Server 已停止'))
    this.process?.kill()
    this.disposeProcess()
    this.startPromise = null
    this.emitStatus(false, 'Codex App Server 已停止')
  }

  private requestConnected(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextRequestId
    this.nextRequestId += 1
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Codex 请求超时：${method}`))
      }, this.requestTimeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      this.send(params === undefined ? { method, id } : { method, id, params })
    })
  }

  private send(message: JsonObject): void {
    if (!this.process?.stdin.writable) throw new Error('Codex App Server 尚未连接')
    this.process.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private handleLine(line: string): void {
    let message: unknown
    try {
      message = JSON.parse(line)
    } catch {
      console.warn('忽略无法解析的 Codex App Server 输出')
      return
    }
    if (!isRecord(message)) return

    if ('id' in message && !('method' in message)) {
      const id = message.id as RequestId
      const pending = this.pending.get(id)
      if (!pending) return
      this.pending.delete(id)
      clearTimeout(pending.timeout)
      if ('error' in message) pending.reject(new Error(errorMessage(message.error)))
      else pending.resolve(message.result)
      return
    }

    if (typeof message.method !== 'string') return
    if ('id' in message) {
      const request = {
        id: message.id as RequestId,
        method: message.method,
        params: message.params
      }
      for (const listener of this.requestListeners) listener(request)
      return
    }
    const notification = { method: message.method, params: message.params }
    for (const listener of this.notificationListeners) listener(notification)
  }

  private handleDisconnect(child: ChildProcessWithoutNullStreams, message: string): void {
    if (this.process !== child) return
    this.rejectPending(new Error(message))
    this.disposeProcess()
    this.startPromise = null
    this.emitStatus(false, message)
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private disposeProcess(): void {
    this.stdoutReader?.close()
    this.stdoutReader = null
    this.process = null
    this.userAgent = undefined
  }

  private emitStatus(connected: boolean, message: string): void {
    for (const listener of this.statusListeners) listener(connected, message)
  }
}
