import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  detectVersion,
  extractText,
  findMaterial,
  loadDraft,
  type Draft,
  type MaterialText,
  type Segment,
  type Track
} from 'capcut-cli'

export interface JianyingEnvironmentStatus {
  executablePath: string | null
  executableExists: boolean
  expectedVersion: string
  draftRoot: string | null
  draftRootExists: boolean
  autoUpdateEnabled: boolean | null
  silentUpgradeEnabled: boolean | null
  executableVersion: string | null
  expectedVersionMatches: boolean
  processRunning: boolean | null
  runtimeIsolation: {
    mode: JianyingIsolationMode
    profilePath: string | null
    configured: boolean
  }
  readyForControlledLaunch: boolean
  launchBlockers: Array<{
    code: JianyingLaunchBlockerCode
    message: string
  }>
  upgradePolicy: 'deny'
  writeToolsEnabled: boolean
  launchToolsEnabled: false
  uiAutomationEnabled: false
}

export type JianyingIsolationMode = 'none' | 'separate-windows-user' | 'virtual-machine'

export type JianyingLaunchBlockerCode =
  | 'executable-missing'
  | 'version-unverified'
  | 'version-mismatch'
  | 'process-state-unknown'
  | 'process-running'
  | 'isolation-unconfigured'
  | 'isolation-profile-invalid'
  | 'virtual-machine-transport-unavailable'
  | 'auto-update-state-unknown'
  | 'auto-update-enabled'
  | 'silent-upgrade-state-unknown'
  | 'silent-upgrade-enabled'

export interface JianyingDraftInspection {
  draftName: string
  draftPath: string
  app: string
  appVersion: string | null
  supportStatus: string
  writeGuard: string
  canonicalFile: string
  mirrorsInSync: boolean
  trackOrder: string[]
  trackCount: number
  segmentCount: number
  textSegments: Array<{
    id: string
    startUs: number
    durationUs: number
    text: string
  }>
}

export interface JianyingTextChangePreview {
  draftName: string
  segmentId: string
  currentText: string
  nextText: string
  currentStyleRange: [number, number] | null
  proposedStyleRange: [number, number]
  targetFiles: string[]
  safeguards: string[]
  warnings: string[]
  writesPerformed: false
}

export interface JianyingReadServiceOptions {
  draftRoot?: string
  executablePath?: string
  expectedVersion?: string
  autoUpdateEnabled?: boolean | null
  silentUpgradeEnabled?: boolean | null
  runtimeIsolationMode?: JianyingIsolationMode
  runtimeProfilePath?: string
  hostUserProfilePath?: string
  getExecutableVersion?: (path: string) => string | null
  isJianyingRunning?: () => boolean | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPathInside(parent: string, candidate: string): boolean {
  const path = relative(resolve(parent), resolve(candidate))
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

function parseTextContent(material: MaterialText): {
  text: string
  range: [number, number] | null
} {
  try {
    const content = JSON.parse(material.content) as unknown
    if (!isRecord(content)) return { text: extractText(material.content), range: null }
    const styles = Array.isArray(content.styles) ? content.styles : []
    const firstStyle = isRecord(styles[0]) ? styles[0] : null
    const rawRange = firstStyle?.range
    const range =
      Array.isArray(rawRange) &&
      rawRange.length === 2 &&
      typeof rawRange[0] === 'number' &&
      typeof rawRange[1] === 'number'
        ? ([rawRange[0], rawRange[1]] as [number, number])
        : null
    return { text: typeof content.text === 'string' ? content.text : '', range }
  } catch {
    return { text: extractText(material.content), range: null }
  }
}

function timelineHash(path: string): string | null {
  if (!existsSync(path)) return null
  try {
    const timeline = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return createHash('sha256').update(JSON.stringify(timeline)).digest('hex')
  } catch {
    return null
  }
}

function defaultExecutableVersion(path: string): string | null {
  if (process.platform !== 'win32') return null
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$item = Get-Item -LiteralPath $env:DESKTOP_CLIENT_JIANYING_EXE; [Console]::Out.Write($item.VersionInfo.FileVersion)'
    ],
    {
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true,
      env: { ...process.env, DESKTOP_CLIENT_JIANYING_EXE: path }
    }
  )
  if (result.error || result.status !== 0) return null
  return result.stdout.trim() || null
}

function defaultIsJianyingRunning(): boolean | null {
  if (process.platform !== 'win32') return false
  const result = spawnSync(
    'tasklist',
    ['/FI', 'IMAGENAME eq JianyingPro.exe', '/FO', 'CSV', '/NH'],
    { encoding: 'utf8', timeout: 3_000, windowsHide: true }
  )
  if (result.error || result.status !== 0) return null
  return result.stdout.toLowerCase().includes('jianyingpro.exe')
}

function expectedVersionMatches(expected: string, actual: string | null): boolean {
  if (!actual) return false
  return expected.endsWith('.x') ? actual.startsWith(expected.slice(0, -1)) : actual === expected
}

function isConfiguredIsolationProfile(
  mode: JianyingIsolationMode,
  runtimeProfilePath: string | null,
  hostUserProfilePath: string | null
): boolean {
  if (mode !== 'separate-windows-user' || !runtimeProfilePath || !hostUserProfilePath) return false
  try {
    const runtimeProfile = realpathSync(runtimeProfilePath)
    const hostProfile = realpathSync(hostUserProfilePath)
    if (!statSync(runtimeProfile).isDirectory() || !statSync(hostProfile).isDirectory())
      return false
    return !isPathInside(runtimeProfile, hostProfile) && !isPathInside(hostProfile, runtimeProfile)
  } catch {
    return false
  }
}

export function findTextMaterial(
  draft: Draft,
  segmentId: string
): {
  material: MaterialText
  segment: Segment
} {
  const normalizedId = segmentId.toLowerCase()
  const prefixMatches: Array<{ track: Track; segment: Segment }> = []
  for (const track of draft.tracks) {
    for (const segment of track.segments) {
      if (segment.id.toLowerCase().startsWith(normalizedId)) {
        prefixMatches.push({ track, segment })
      }
    }
  }
  const exact = prefixMatches.find((match) => match.segment.id === segmentId)
  const found = exact ?? prefixMatches[0]
  if (!found) throw new Error('未找到指定字幕片段')
  if (!exact && prefixMatches.length > 1) throw new Error('字幕片段 ID 前缀不唯一')
  if (found.track.type !== 'text') throw new Error('指定片段不是字幕轨道')
  const material = findMaterial(draft.materials.texts, found.segment.material_id)
  if (!material) throw new Error('字幕片段缺少关联文本素材')
  return { material, segment: found.segment }
}

export function assertJianying59Draft(draft: Draft): ReturnType<typeof detectVersion> {
  const version = detectVersion(draft)
  if (version.app_source !== 'lv' || !version.app_version?.startsWith('5.9.')) {
    throw new Error(
      `仅允许检查剪映 5.9 明文草稿，当前识别为 ${version.app} ${version.app_version ?? 'unknown'}`
    )
  }
  return version
}

export class JianyingReadService {
  private readonly draftRoot: string | null
  private readonly executablePath: string | null
  private readonly expectedVersion: string
  private readonly autoUpdateEnabled: boolean | null
  private readonly silentUpgradeEnabled: boolean | null
  private readonly runtimeIsolationMode: JianyingIsolationMode
  private readonly runtimeProfilePath: string | null
  private readonly hostUserProfilePath: string | null
  private readonly getExecutableVersion: (path: string) => string | null
  private readonly isJianyingRunning: () => boolean | null

  constructor(options: JianyingReadServiceOptions) {
    this.draftRoot = options.draftRoot ? resolve(options.draftRoot) : null
    this.executablePath = options.executablePath ? resolve(options.executablePath) : null
    this.expectedVersion = options.expectedVersion ?? '5.9.x'
    this.autoUpdateEnabled = options.autoUpdateEnabled ?? null
    this.silentUpgradeEnabled = options.silentUpgradeEnabled ?? null
    this.runtimeIsolationMode = options.runtimeIsolationMode ?? 'none'
    this.runtimeProfilePath = options.runtimeProfilePath
      ? resolve(options.runtimeProfilePath)
      : null
    this.hostUserProfilePath = options.hostUserProfilePath
      ? resolve(options.hostUserProfilePath)
      : null
    this.getExecutableVersion = options.getExecutableVersion ?? defaultExecutableVersion
    this.isJianyingRunning = options.isJianyingRunning ?? defaultIsJianyingRunning
  }

  get configuredDraftRoot(): string | null {
    return this.draftRoot
  }

  environmentStatus(): JianyingEnvironmentStatus {
    const executableExists = this.executablePath !== null && existsSync(this.executablePath)
    const executableVersion = executableExists
      ? this.getExecutableVersion(this.executablePath as string)
      : null
    const versionMatches = expectedVersionMatches(this.expectedVersion, executableVersion)
    const processRunning = this.isJianyingRunning()
    const isolationConfigured = isConfiguredIsolationProfile(
      this.runtimeIsolationMode,
      this.runtimeProfilePath,
      this.hostUserProfilePath
    )
    const launchBlockers: JianyingEnvironmentStatus['launchBlockers'] = []
    if (!executableExists) {
      launchBlockers.push({ code: 'executable-missing', message: '剪映 5.9 可执行文件不存在' })
    } else if (!executableVersion) {
      launchBlockers.push({ code: 'version-unverified', message: '无法读取剪映可执行文件版本' })
    } else if (!versionMatches) {
      launchBlockers.push({
        code: 'version-mismatch',
        message: '剪映可执行文件版本与锁定版本不一致'
      })
    }
    if (processRunning === null) {
      launchBlockers.push({ code: 'process-state-unknown', message: '无法确认剪映进程状态' })
    } else if (processRunning) {
      launchBlockers.push({ code: 'process-running', message: '检测到剪映进程正在运行' })
    }
    if (this.runtimeIsolationMode === 'virtual-machine') {
      launchBlockers.push({
        code: 'virtual-machine-transport-unavailable',
        message: '尚未接入虚拟机执行通道'
      })
    } else if (this.runtimeIsolationMode === 'none') {
      launchBlockers.push({
        code: 'isolation-unconfigured',
        message: '尚未配置独立 Windows 用户运行环境'
      })
    } else if (!isolationConfigured) {
      launchBlockers.push({
        code: 'isolation-profile-invalid',
        message: '独立 Windows 用户配置目录不存在或与当前用户重叠'
      })
    }
    if (this.autoUpdateEnabled === null) {
      launchBlockers.push({ code: 'auto-update-state-unknown', message: '无法确认自动更新开关' })
    } else if (this.autoUpdateEnabled) {
      launchBlockers.push({ code: 'auto-update-enabled', message: '自动更新仍处于开启状态' })
    }
    if (this.silentUpgradeEnabled === null) {
      launchBlockers.push({
        code: 'silent-upgrade-state-unknown',
        message: '无法确认静默升级开关'
      })
    } else if (this.silentUpgradeEnabled) {
      launchBlockers.push({ code: 'silent-upgrade-enabled', message: '静默升级仍处于开启状态' })
    }
    return {
      executablePath: this.executablePath,
      executableExists,
      expectedVersion: this.expectedVersion,
      draftRoot: this.draftRoot,
      draftRootExists: this.draftRoot !== null && existsSync(this.draftRoot),
      autoUpdateEnabled: this.autoUpdateEnabled,
      silentUpgradeEnabled: this.silentUpgradeEnabled,
      executableVersion,
      expectedVersionMatches: versionMatches,
      processRunning,
      runtimeIsolation: {
        mode: this.runtimeIsolationMode,
        profilePath: this.runtimeProfilePath,
        configured: isolationConfigured
      },
      readyForControlledLaunch: launchBlockers.length === 0,
      launchBlockers,
      upgradePolicy: 'deny',
      writeToolsEnabled: false,
      launchToolsEnabled: false,
      uiAutomationEnabled: false
    }
  }

  async inspectDraft(draftName: string): Promise<JianyingDraftInspection> {
    const draftPath = await this.resolveDraftPath(draftName)
    const { draft } = loadDraft(draftPath)
    const version = assertJianying59Draft(draft)
    const canonicalHash = timelineHash(join(draftPath, 'draft_content.json'))
    const mirrorHash = timelineHash(join(draftPath, 'template-2.tmp'))

    const textSegments = draft.tracks
      .filter((track) => track.type === 'text')
      .flatMap((track) =>
        track.segments.map((segment) => {
          const material = findMaterial(draft.materials.texts, segment.material_id)
          return {
            id: segment.id,
            startUs: segment.target_timerange.start,
            durationUs: segment.target_timerange.duration,
            text: material ? extractText(material.content) : ''
          }
        })
      )

    return {
      draftName: basename(draftPath),
      draftPath,
      app: version.app,
      appVersion: version.app_version,
      supportStatus: version.support.status,
      writeGuard: version.support.write_guard,
      canonicalFile: 'draft_content.json',
      mirrorsInSync: canonicalHash !== null && canonicalHash === mirrorHash,
      trackOrder: draft.tracks.map((track) => track.type),
      trackCount: draft.tracks.length,
      segmentCount: draft.tracks.reduce((count, track) => count + track.segments.length, 0),
      textSegments
    }
  }

  async previewTextChange(
    draftName: string,
    segmentId: string,
    nextText: string
  ): Promise<JianyingTextChangePreview> {
    const normalizedText = nextText.trim()
    if (!normalizedText) throw new Error('字幕文本不能为空')
    if (normalizedText.length > 20_000) throw new Error('字幕文本长度超过 20,000 字符')

    const draftPath = await this.resolveDraftPath(draftName)
    const { draft } = loadDraft(draftPath)
    assertJianying59Draft(draft)
    const { material } = findTextMaterial(draft, segmentId)
    const current = parseTextContent(material)
    const proposedStyleRange: [number, number] = [0, normalizedText.length]

    return {
      draftName: basename(draftPath),
      segmentId,
      currentText: current.text,
      nextText: normalizedText,
      currentStyleRange: current.range,
      proposedStyleRange,
      targetFiles: ['draft_content.json', 'template-2.tmp'],
      safeguards: [
        '写入前验证剪映版本和两个时间线镜像一致',
        '逐文件保存原始字节备份并记录 SHA256',
        '只允许目标字幕内容和对应样式范围发生变化',
        '同目录临时文件 fsync 后原子替换',
        '失败时直接恢复原始字节，不重新序列化快照'
      ],
      warnings: [
        '当前仅生成预览，不会写入草稿',
        '剪映 5.9 实际样本的样式范围按字符数保存，不采用 capcut-cli 的 UTF-16LE 字节数',
        '保持剪映原始轨道顺序，不执行 capcut-cli 的 CapCut 轨道排序'
      ],
      writesPerformed: false
    }
  }

  async resolveDraftPath(draftName: string): Promise<string> {
    if (!this.draftRoot) throw new Error('尚未配置剪映草稿根目录')
    if (!draftName.trim() || draftName !== basename(draftName) || /[\\/]/.test(draftName)) {
      throw new Error('草稿名称无效')
    }
    if (!existsSync(this.draftRoot) || !statSync(this.draftRoot).isDirectory()) {
      throw new Error('剪映草稿根目录不存在')
    }

    const root = await realpath(this.draftRoot)
    const candidate = join(root, draftName)
    const target = await realpath(candidate).catch(() => {
      throw new Error('指定剪映草稿不存在')
    })
    const path = relative(root, target)
    if (
      path === '' ||
      path === '..' ||
      path.startsWith(`..${sep}`) ||
      isAbsolute(path) ||
      dirname(target) !== root ||
      !statSync(target).isDirectory()
    ) {
      throw new Error('草稿路径超出允许范围')
    }
    if (!existsSync(join(target, 'draft_content.json'))) {
      throw new Error('草稿缺少 draft_content.json')
    }
    return target
  }
}

export function readJianyingHostSettings(localAppData?: string): {
  draftRoot?: string
  autoUpdateEnabled: boolean | null
  silentUpgradeEnabled: boolean | null
} {
  if (!localAppData) return { autoUpdateEnabled: null, silentUpgradeEnabled: null }
  const settingsPath = join(localAppData, 'JianyingPro', 'User Data', 'Config', 'globalSetting')
  if (!existsSync(settingsPath)) {
    return { autoUpdateEnabled: null, silentUpgradeEnabled: null }
  }
  const content = readFileSync(settingsPath, 'utf8')
  const draftRoot = /^currentCustomDraftPath=(.+)$/m
    .exec(content)?.[1]
    ?.trim()
    .replace(/\\\\/g, '\\')
  const autoUpdate = /^enableAutoUpdate=(true|false)\r?$/m.exec(content)?.[1]
  const silentUpgrade = /^totalSilentUpgradeSwitch=(true|false)\r?$/m.exec(content)?.[1]
  return {
    draftRoot: draftRoot || undefined,
    autoUpdateEnabled: autoUpdate === undefined ? null : autoUpdate === 'true',
    silentUpgradeEnabled: silentUpgrade === undefined ? null : silentUpgrade === 'true'
  }
}

export function inferJianying59Executable(draftRoot?: string): string | undefined {
  const explicit = process.env.JIANYING_5_9_BIN?.trim()
  if (explicit && existsSync(explicit)) return resolve(explicit)
  if (!draftRoot) return undefined
  const candidate = join(dirname(resolve(draftRoot)), '5.9', 'JianyingPro.exe')
  return existsSync(candidate) ? candidate : undefined
}

export function parseJianyingIsolationMode(value?: string): JianyingIsolationMode {
  return value === 'separate-windows-user' || value === 'virtual-machine' ? value : 'none'
}
