import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstatSync, realpathSync, statSync } from 'node:fs'
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const SETTINGS_RELATIVE_PATH = join(
  'AppData',
  'Local',
  'JianyingPro',
  'User Data',
  'Config',
  'globalSetting'
)
const BACKUP_RELATIVE_PATH = join('.desktop-client-backups', 'upgrade-policy')
const TOKEN_TTL_MS = 10 * 60 * 1_000
const MANAGED_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface SettingsState {
  path: string
  raw: Buffer
  hash: string
  text: string
  autoUpdateEnabled: boolean
  silentUpgradeEnabled: boolean
}

interface PendingPolicyChange {
  settingsPath: string
  beforeHash: string
  expiresAt: number
}

export interface JianyingUpgradePolicyServiceOptions {
  runtimeProfilePath?: string
  hostUserProfilePath?: string
  isJianyingRunning?: () => boolean
  now?: () => number
  createId?: () => string
  failAfterReplace?: () => void
}

export interface JianyingNoUpgradePreview {
  policy: 'deny'
  previewToken: string | null
  settingsPath: string
  beforeHash: string
  current: {
    autoUpdateEnabled: boolean
    silentUpgradeEnabled: boolean
  }
  proposed: {
    autoUpdateEnabled: false
    silentUpgradeEnabled: false
  }
  requiresWrite: boolean
  expiresAt: string | null
  writesPerformed: false
}

export interface JianyingNoUpgradeApplied {
  policy: 'deny'
  transactionId: string
  settingsPath: string
  beforeHash: string
  afterHash: string
  backupCreated: true
  changedKeys: Array<'enableAutoUpdate' | 'totalSilentUpgradeSwitch'>
  writesPerformed: true
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function isPathInside(parent: string, candidate: string): boolean {
  const path = relative(resolve(parent), resolve(candidate))
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

function defaultIsJianyingRunning(): boolean {
  if (process.platform !== 'win32') return false
  const result = spawnSync(
    'tasklist',
    ['/FI', 'IMAGENAME eq JianyingPro.exe', '/FO', 'CSV', '/NH'],
    { encoding: 'utf8', timeout: 3_000, windowsHide: true }
  )
  if (result.error || result.status !== 0)
    throw new Error('无法确认剪映进程状态，已停止修改升级策略')
  return result.stdout.toLowerCase().includes('jianyingpro.exe')
}

function parseBooleanSetting(text: string, key: string): boolean {
  const expression = new RegExp(`^${key}=(true|false)\\r?$`, 'gm')
  const matches = [...text.matchAll(expression)]
  if (matches.length !== 1) throw new Error(`剪映配置中的 ${key} 缺失或不唯一`)
  return matches[0][1] === 'true'
}

function parseSettings(path: string, raw: Buffer): SettingsState {
  if (raw.length === 0) throw new Error('剪映 globalSetting 为空')
  const text = raw.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(raw) || text.charCodeAt(0) === 0xfeff) {
    throw new Error('剪映 globalSetting 不是无 BOM 的 UTF-8 文件')
  }
  return {
    path,
    raw,
    hash: sha256(raw),
    text,
    autoUpdateEnabled: parseBooleanSetting(text, 'enableAutoUpdate'),
    silentUpgradeEnabled: parseBooleanSetting(text, 'totalSilentUpgradeSwitch')
  }
}

function enforceNoUpgrade(text: string): {
  text: string
  changedKeys: Array<'enableAutoUpdate' | 'totalSilentUpgradeSwitch'>
} {
  const changedKeys: Array<'enableAutoUpdate' | 'totalSilentUpgradeSwitch'> = []
  let updated = text.replace(
    /^enableAutoUpdate=(true|false)(\r?)$/gm,
    (_match, value: string, carriageReturn: string) => {
      if (value === 'true') changedKeys.push('enableAutoUpdate')
      return `enableAutoUpdate=false${carriageReturn}`
    }
  )
  updated = updated.replace(
    /^totalSilentUpgradeSwitch=(true|false)(\r?)$/gm,
    (_match, value: string, carriageReturn: string) => {
      if (value === 'true') changedKeys.push('totalSilentUpgradeSwitch')
      return `totalSilentUpgradeSwitch=false${carriageReturn}`
    }
  )
  parseBooleanSetting(updated, 'enableAutoUpdate')
  parseBooleanSetting(updated, 'totalSilentUpgradeSwitch')
  return { text: updated, changedKeys }
}

async function writeDurable(path: string, value: Buffer | string): Promise<void> {
  const handle = await open(path, 'wx', 0o600)
  try {
    await handle.writeFile(value)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function replaceAtomic(path: string, value: Buffer | string): Promise<void> {
  const temporaryPath = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`)
  try {
    await writeDurable(temporaryPath, value)
    await rename(temporaryPath, path)
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

export class JianyingUpgradePolicyService {
  private readonly runtimeProfilePath: string | null
  private readonly hostUserProfilePath: string | null
  private readonly isJianyingRunning: () => boolean
  private readonly now: () => number
  private readonly createId: () => string
  private readonly failAfterReplace?: () => void
  private readonly pendingChanges = new Map<string, PendingPolicyChange>()

  constructor(options: JianyingUpgradePolicyServiceOptions) {
    this.runtimeProfilePath = options.runtimeProfilePath
      ? resolve(options.runtimeProfilePath)
      : null
    this.hostUserProfilePath = options.hostUserProfilePath
      ? resolve(options.hostUserProfilePath)
      : null
    this.isJianyingRunning = options.isJianyingRunning ?? defaultIsJianyingRunning
    this.now = options.now ?? Date.now
    this.createId = options.createId ?? randomUUID
    this.failAfterReplace = options.failAfterReplace
  }

  get enabled(): boolean {
    if (!this.runtimeProfilePath || !this.hostUserProfilePath) return false
    try {
      const runtimeProfile = realpathSync(this.runtimeProfilePath)
      const hostProfile = realpathSync(this.hostUserProfilePath)
      if (!statSync(runtimeProfile).isDirectory() || !statSync(hostProfile).isDirectory()) {
        return false
      }
      if (isPathInside(runtimeProfile, hostProfile) || isPathInside(hostProfile, runtimeProfile)) {
        return false
      }
      const settingsPath = join(runtimeProfile, SETTINGS_RELATIVE_PATH)
      const status = lstatSync(settingsPath)
      return (
        status.isFile() &&
        !status.isSymbolicLink() &&
        isPathInside(runtimeProfile, realpathSync(settingsPath))
      )
    } catch {
      return false
    }
  }

  async previewNoUpgradePolicy(): Promise<JianyingNoUpgradePreview> {
    const state = await this.readSettings()
    const requiresWrite = state.autoUpdateEnabled || state.silentUpgradeEnabled
    const previewToken = requiresWrite ? this.validGeneratedId() : null
    const expiresAt = requiresWrite ? this.now() + TOKEN_TTL_MS : null
    this.removeExpiredPreviews()
    if (previewToken && expiresAt !== null) {
      this.pendingChanges.set(previewToken, {
        settingsPath: state.path,
        beforeHash: state.hash,
        expiresAt
      })
    }
    return {
      policy: 'deny',
      previewToken,
      settingsPath: state.path,
      beforeHash: state.hash,
      current: {
        autoUpdateEnabled: state.autoUpdateEnabled,
        silentUpgradeEnabled: state.silentUpgradeEnabled
      },
      proposed: { autoUpdateEnabled: false, silentUpgradeEnabled: false },
      requiresWrite,
      expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
      writesPerformed: false
    }
  }

  async applyNoUpgradePolicy(previewToken: string): Promise<JianyingNoUpgradeApplied> {
    const pending = this.pendingChanges.get(previewToken)
    this.pendingChanges.delete(previewToken)
    if (!pending) throw new Error('升级策略预览不存在或已使用')
    if (pending.expiresAt <= this.now()) throw new Error('升级策略预览已过期，请重新预览')
    this.assertEditorClosed()
    const before = await this.readSettings()
    if (before.path !== pending.settingsPath || before.hash !== pending.beforeHash) {
      throw new Error('剪映配置在预览后已变更，请重新预览')
    }
    const updated = enforceNoUpgrade(before.text)
    if (updated.changedKeys.length === 0) throw new Error('禁止升级策略已经生效，无需写入')
    const updatedRaw = Buffer.from(updated.text, 'utf8')
    const after = parseSettings(before.path, updatedRaw)
    if (after.autoUpdateEnabled || after.silentUpgradeEnabled) {
      throw new Error('禁止升级策略验证失败')
    }

    const transactionId = this.validGeneratedId()
    const backupPath = await this.createBackup(before, transactionId)
    let targetMayHaveChanged = false
    try {
      targetMayHaveChanged = true
      await replaceAtomic(before.path, updatedRaw)
      this.failAfterReplace?.()
      const verified = await this.readSettings()
      if (
        verified.hash !== after.hash ||
        verified.autoUpdateEnabled ||
        verified.silentUpgradeEnabled
      ) {
        throw new Error('写入后升级策略校验失败')
      }
      await replaceAtomic(
        join(backupPath, 'transaction.json'),
        `${JSON.stringify(
          {
            schemaVersion: 1,
            transactionId,
            policy: 'deny',
            settingsPath: before.path,
            beforeHash: before.hash,
            afterHash: verified.hash,
            changedKeys: updated.changedKeys,
            createdAt: new Date(this.now()).toISOString(),
            status: 'applied'
          },
          null,
          2
        )}\n`
      )
      return {
        policy: 'deny',
        transactionId,
        settingsPath: before.path,
        beforeHash: before.hash,
        afterHash: verified.hash,
        backupCreated: true,
        changedKeys: updated.changedKeys,
        writesPerformed: true
      }
    } catch (error) {
      if (targetMayHaveChanged) {
        try {
          await replaceAtomic(before.path, before.raw)
          const restored = await this.readSettings()
          if (restored.hash !== before.hash) throw new Error('恢复后的配置哈希不一致')
        } catch (rollbackError) {
          const detail = rollbackError instanceof Error ? rollbackError.message : '未知错误'
          throw new Error(`升级策略写入失败且自动恢复失败：${detail}`)
        }
      }
      const detail = error instanceof Error ? error.message : '未知错误'
      throw new Error(`升级策略写入失败，已自动恢复：${detail}`)
    }
  }

  private async readSettings(): Promise<SettingsState> {
    if (!this.runtimeProfilePath || !this.hostUserProfilePath) {
      throw new Error('尚未配置独立 Windows 用户目录')
    }
    const runtimeProfile = await realpath(this.runtimeProfilePath).catch(() => {
      throw new Error('独立 Windows 用户目录不存在')
    })
    const hostProfile = await realpath(this.hostUserProfilePath).catch(() => {
      throw new Error('当前 Windows 用户目录不存在')
    })
    if (isPathInside(runtimeProfile, hostProfile) || isPathInside(hostProfile, runtimeProfile)) {
      throw new Error('独立 Windows 用户目录与当前用户目录重叠')
    }
    const expectedPath = join(runtimeProfile, SETTINGS_RELATIVE_PATH)
    const status = await lstat(expectedPath).catch(() => null)
    if (!status?.isFile() || status.isSymbolicLink()) {
      throw new Error('隔离用户的剪映 globalSetting 不存在或不是普通文件')
    }
    const settingsPath = await realpath(expectedPath)
    if (!isPathInside(runtimeProfile, settingsPath)) {
      throw new Error('剪映 globalSetting 超出隔离用户目录')
    }
    return parseSettings(settingsPath, await readFile(settingsPath))
  }

  private async createBackup(state: SettingsState, transactionId: string): Promise<string> {
    const backupRoot = join(dirname(state.path), BACKUP_RELATIVE_PATH)
    await mkdir(backupRoot, { recursive: true })
    const backupRootStatus = await lstat(backupRoot)
    if (!backupRootStatus.isDirectory() || backupRootStatus.isSymbolicLink()) {
      throw new Error('升级策略备份目录无效')
    }
    const backupPath = join(backupRoot, transactionId)
    await mkdir(backupPath)
    try {
      await writeDurable(join(backupPath, 'globalSetting.original'), state.raw)
      return backupPath
    } catch (error) {
      await rm(backupPath, { recursive: true, force: true })
      throw error
    }
  }

  private assertEditorClosed(): void {
    if (this.isJianyingRunning()) throw new Error('检测到剪映正在运行，已拒绝修改升级策略')
  }

  private validGeneratedId(): string {
    const id = this.createId()
    if (!MANAGED_ID_PATTERN.test(id)) throw new Error('内部升级策略 ID 无效')
    return id
  }

  private removeExpiredPreviews(): void {
    const now = this.now()
    for (const [token, pending] of this.pendingChanges) {
      if (pending.expiresAt <= now) this.pendingChanges.delete(token)
    }
  }
}
