import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import type { CodexActionResponse, CodexEvent } from '../../shared/codex'
import {
  isCodexApprovalResponseRequest,
  isCodexInterruptTurnRequest,
  isCodexResumeThreadRequest,
  isCodexStartThreadRequest,
  isCodexStartTurnRequest
} from '../../shared/codex'
import { CodexService } from './CodexService'
import { CodexAppServerClient, resolveCodexCommand } from './CodexAppServerClient'
import { createJianyingMcpConfigArgs } from '../jianying/CodexMcpConfig'
import {
  inferJianying59Executable,
  parseJianyingIsolationMode,
  readJianyingHostSettings
} from '../jianying/JianyingReadService'

interface RegisterCodexIpcOptions {
  service?: CodexService
  sendEvent?: (event: CodexEvent) => void
}

const CODEX_CHANNELS = [
  'codex:status:get',
  'codex:model:list',
  'codex:thread:list',
  'codex:thread:start',
  'codex:thread:resume',
  'codex:turn:start',
  'codex:turn:interrupt',
  'codex:approval:respond'
] as const

function invalidRequest(message: string): CodexActionResponse {
  return { success: false, message }
}

export function registerCodexIpc(options: RegisterCodexIpcOptions = {}): () => void {
  const service = options.service ?? createDefaultCodexService()
  const sendEvent =
    options.sendEvent ??
    ((event: CodexEvent) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
          window.webContents.send('codex:event', event)
        }
      }
    })
  const unsubscribe = service.onEvent(sendEvent)

  for (const channel of CODEX_CHANNELS) ipcMain.removeHandler(channel)
  ipcMain.handle('codex:status:get', () => service.getStatus())
  ipcMain.handle('codex:model:list', () => service.listModels())
  ipcMain.handle('codex:thread:list', () => service.listThreads())
  ipcMain.handle('codex:thread:start', (_event, request: unknown) =>
    isCodexStartThreadRequest(request)
      ? service.startThread(request)
      : invalidRequest('无效的 Codex 新建对话请求')
  )
  ipcMain.handle('codex:thread:resume', (_event, request: unknown) =>
    isCodexResumeThreadRequest(request)
      ? service.resumeThread(request)
      : invalidRequest('无效的 Codex 恢复对话请求')
  )
  ipcMain.handle('codex:turn:start', (_event, request: unknown) =>
    isCodexStartTurnRequest(request)
      ? service.startTurn(request)
      : invalidRequest('无效的 Codex Turn 请求')
  )
  ipcMain.handle('codex:turn:interrupt', (_event, request: unknown) =>
    isCodexInterruptTurnRequest(request)
      ? service.interruptTurn(request)
      : invalidRequest('无效的 Codex 取消请求')
  )
  ipcMain.handle('codex:approval:respond', (_event, request: unknown) =>
    isCodexApprovalResponseRequest(request)
      ? service.respondApproval(request)
      : invalidRequest('无效的 Codex 审批响应')
  )

  return () => {
    unsubscribe()
    service.stop()
    for (const channel of CODEX_CHANNELS) ipcMain.removeHandler(channel)
  }
}

function createDefaultCodexService(): CodexService {
  const runtimeIsolationMode = parseJianyingIsolationMode(process.env.JIANYING_ISOLATION_MODE)
  const runtimeProfilePath = process.env.JIANYING_RUNTIME_PROFILE?.trim()
  const settingsLocalAppData =
    runtimeIsolationMode === 'separate-windows-user' && runtimeProfilePath
      ? join(runtimeProfilePath, 'AppData', 'Local')
      : process.env.LOCALAPPDATA
  const hostSettings = readJianyingHostSettings(settingsLocalAppData)
  const executablePath = inferJianying59Executable(hostSettings.draftRoot)
  const mcpConfigArgs = createJianyingMcpConfigArgs({
    command: process.execPath,
    serverEntry: join(__dirname, 'jianying-mcp.js'),
    draftRoot: hostSettings.draftRoot,
    workingCopyRoot: join(app.getPath('userData'), 'jianying-working-copies'),
    executablePath,
    expectedVersion: '5.9.0.11632',
    autoUpdateEnabled: hostSettings.autoUpdateEnabled,
    silentUpgradeEnabled: hostSettings.silentUpgradeEnabled,
    runtimeIsolationMode,
    runtimeProfilePath,
    hostUserProfilePath: process.env.USERPROFILE
  })
  return new CodexService({
    client: new CodexAppServerClient({ command: resolveCodexCommand(mcpConfigArgs) }),
    workspaceDirectory: join(app.getPath('userData'), 'codex-workspace')
  })
}
