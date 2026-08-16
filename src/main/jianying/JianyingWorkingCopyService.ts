import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser'
import { loadDraft, type Draft, type MaterialText } from 'capcut-cli'
import { assertJianying59Draft, findTextMaterial, JianyingReadService } from './JianyingReadService'

const WORKING_COPY_MANIFEST = '.desktop-client-working-copy.json'
const BACKUP_DIRECTORY = '.desktop-client-backups'
const MANAGED_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256_PATTERN = /^[0-9a-f]{64}$/i
const DEFAULT_PREVIEW_TTL_MS = 10 * 60 * 1_000

type TargetFileName = 'draft_content.json' | 'template-2.tmp'
type FileHashes = Record<TargetFileName, string>
type FailPoint = 'after-canonical-replace' | 'after-mirror-replace'

interface WorkingCopyManifest {
  schemaVersion: 1
  workingCopyId: string
  sourceDraftName: string
  createdAt: string
  sourceHashes: FileHashes
}

interface PendingTextChange {
  workingCopyId: string
  segmentId: string
  materialId: string
  currentText: string
  nextText: string
  proposedStyleRange: [number, number]
  beforeHashes: FileHashes
  expiresAt: number
}

interface TransactionMetadata {
  schemaVersion: 1
  transactionId: string
  workingCopyId: string
  segmentId: string
  materialId: string
  currentText: string
  nextText: string
  beforeHashes: FileHashes
  afterHashes: FileHashes
  createdAt: string
  status: 'prepared' | 'applied' | 'auto-rolled-back' | 'rolled-back'
}

interface DraftPair {
  path: string
  raw: Record<TargetFileName, Buffer>
  hashes: FileHashes
  draft: Draft
}

export interface JianyingWorkingCopyServiceOptions {
  sourceDrafts: JianyingReadService
  workingCopyRoot?: string
  isJianyingRunning?: () => boolean
  now?: () => number
  createId?: () => string
  failPoint?: (point: FailPoint) => void
}

export interface JianyingWorkingCopyPrepared {
  workingCopyId: string
  sourceDraftName: string
  createdAt: string
  sourceHashes: FileHashes
  writesPerformed: true
}

export interface JianyingWorkingCopyTextPreview {
  previewToken: string
  workingCopyId: string
  segmentId: string
  currentText: string
  nextText: string
  currentStyleRange: [number, number]
  proposedStyleRange: [number, number]
  beforeHashes: FileHashes
  expiresAt: string
  writesPerformed: false
}

export interface JianyingTextChangeApplied {
  transactionId: string
  workingCopyId: string
  segmentId: string
  beforeHashes: FileHashes
  afterHashes: FileHashes
  changedFields: ['materials.texts[].content.text', 'materials.texts[].content.styles[0].range']
  backupCreated: true
  writesPerformed: true
}

export interface JianyingTextChangeRolledBack {
  transactionId: string
  workingCopyId: string
  restoredHashes: FileHashes
  rolledBack: true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function fileHashes(raw: Record<TargetFileName, Buffer>): FileHashes {
  return {
    'draft_content.json': sha256(raw['draft_content.json']),
    'template-2.tmp': sha256(raw['template-2.tmp'])
  }
}

function isFileHashes(value: unknown): value is FileHashes {
  return (
    isRecord(value) &&
    typeof value['draft_content.json'] === 'string' &&
    SHA256_PATTERN.test(value['draft_content.json']) &&
    typeof value['template-2.tmp'] === 'string' &&
    SHA256_PATTERN.test(value['template-2.tmp'])
  )
}

function isPathInside(parent: string, candidate: string): boolean {
  const path = relative(resolve(parent), resolve(candidate))
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

async function resolveProspectivePath(path: string): Promise<string> {
  let current = resolve(path)
  const missingSegments: string[] = []
  for (;;) {
    try {
      return join(await realpath(current), ...missingSegments.reverse())
    } catch {
      const parent = dirname(current)
      if (parent === current) throw new Error('无法解析工作副本目录')
      missingSegments.push(basename(current))
      current = parent
    }
  }
}

function parseJsonObject(raw: Buffer | string, label: string): Record<string, unknown> {
  const text = raw.toString()
  if (text.charCodeAt(0) === 0xfeff) throw new Error(`${label} 含 BOM，当前不允许安全写入`)
  const errors: ParseError[] = []
  const value = parse(text, errors, {
    allowTrailingComma: false,
    disallowComments: true
  }) as unknown
  if (errors.length > 0 || !isRecord(value)) throw new Error(`${label} 不是有效的 JSON 草稿`)
  return value
}

function semanticHash(value: Record<string, unknown>): string {
  return sha256(JSON.stringify(value))
}

function defaultIsJianyingRunning(): boolean {
  if (process.platform !== 'win32') return false
  const result = spawnSync(
    'tasklist',
    ['/FI', 'IMAGENAME eq JianyingPro.exe', '/FO', 'CSV', '/NH'],
    { encoding: 'utf8', timeout: 3_000, windowsHide: true }
  )
  if (result.error || result.status !== 0) throw new Error('无法确认剪映进程状态，已停止写入')
  return result.stdout.toLowerCase().includes('jianyingpro.exe')
}

async function assertRegularFile(path: string, label: string): Promise<void> {
  const status = await lstat(path).catch(() => null)
  if (!status?.isFile() || status.isSymbolicLink()) throw new Error(`${label} 不是可写的普通文件`)
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

function readTextState(material: MaterialText): {
  text: string
  range: [number, number]
} {
  if (material.words !== undefined && material.words !== null) {
    throw new Error('逐词字幕暂不支持安全替换')
  }
  let content: unknown
  try {
    content = JSON.parse(material.content)
  } catch {
    throw new Error('字幕内容不是可安全写入的 JSON')
  }
  if (!isRecord(content) || typeof content.text !== 'string') {
    throw new Error('字幕内容缺少文本字段')
  }
  const styles = content.styles
  if (!Array.isArray(styles) || styles.length !== 1 || !isRecord(styles[0])) {
    throw new Error('当前只支持单样式字幕的安全替换')
  }
  const range = styles[0].range
  if (
    !Array.isArray(range) ||
    range.length !== 2 ||
    typeof range[0] !== 'number' ||
    typeof range[1] !== 'number'
  ) {
    throw new Error('字幕样式范围无效')
  }
  return { text: content.text, range: [range[0], range[1]] }
}

function findTextMaterialIndex(root: Record<string, unknown>, materialId: string): number {
  const materials = root.materials
  const texts = isRecord(materials) ? materials.texts : null
  if (!Array.isArray(texts)) throw new Error('草稿缺少文本素材列表')
  const matches = texts.flatMap((value, index) =>
    isRecord(value) && value.id === materialId ? [index] : []
  )
  if (matches.length !== 1) throw new Error('目标字幕素材不唯一')
  return matches[0]
}

function materialAt(root: Record<string, unknown>, index: number): Record<string, unknown> {
  const materials = root.materials
  const texts = isRecord(materials) ? materials.texts : null
  const material = Array.isArray(texts) ? texts[index] : null
  if (!isRecord(material)) throw new Error('目标字幕素材无效')
  return material
}

function assertOnlyAllowedTextFieldsChanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  materialId: string,
  nextText: string,
  nextRange: [number, number]
): void {
  const beforeIndex = findTextMaterialIndex(before, materialId)
  const afterIndex = findTextMaterialIndex(after, materialId)
  if (beforeIndex !== afterIndex) throw new Error('字幕素材顺序发生变化')
  const beforeMaterial = materialAt(before, beforeIndex)
  const afterMaterial = materialAt(after, afterIndex)
  const beforeContent = beforeMaterial.content
  const afterContent = afterMaterial.content
  if (typeof beforeContent !== 'string' || typeof afterContent !== 'string') {
    throw new Error('字幕内容字段无效')
  }

  const normalizedAfter = structuredClone(after)
  materialAt(normalizedAfter, afterIndex).content = beforeContent
  if (!isDeepStrictEqual(normalizedAfter, before)) throw new Error('变更超出字幕内容白名单')

  const innerBefore = JSON.parse(beforeContent) as unknown
  const innerAfter = JSON.parse(afterContent) as unknown
  if (!isRecord(innerBefore) || !isRecord(innerAfter)) throw new Error('字幕内容结构无效')
  const styles = innerAfter.styles
  if (
    innerAfter.text !== nextText ||
    !Array.isArray(styles) ||
    !isRecord(styles[0]) ||
    !isDeepStrictEqual(styles[0].range, nextRange)
  ) {
    throw new Error('字幕文本或样式范围未按预览更新')
  }
  const normalizedInner = structuredClone(innerAfter)
  normalizedInner.text = innerBefore.text
  const normalizedStyles = normalizedInner.styles
  const beforeStyles = innerBefore.styles
  if (
    !Array.isArray(normalizedStyles) ||
    !Array.isArray(beforeStyles) ||
    !isRecord(normalizedStyles[0])
  ) {
    throw new Error('字幕样式结构无效')
  }
  normalizedStyles[0].range = isRecord(beforeStyles[0]) ? beforeStyles[0].range : undefined
  if (!isDeepStrictEqual(normalizedInner, innerBefore)) throw new Error('字幕内部变更超出白名单')
}

function editTextMaterial(
  raw: Buffer,
  materialId: string,
  nextText: string,
  nextRange: [number, number],
  label: string
): Buffer {
  const text = raw.toString('utf8')
  const before = parseJsonObject(raw, label)
  const materialIndex = findTextMaterialIndex(before, materialId)
  const material = materialAt(before, materialIndex)
  if (typeof material.content !== 'string') throw new Error('字幕内容字段无效')
  const inner = JSON.parse(material.content) as unknown
  if (!isRecord(inner) || !Array.isArray(inner.styles) || !isRecord(inner.styles[0])) {
    throw new Error('字幕内容结构无效')
  }
  const nextInner = structuredClone(inner)
  nextInner.text = nextText
  if (!Array.isArray(nextInner.styles) || !isRecord(nextInner.styles[0])) {
    throw new Error('字幕样式结构无效')
  }
  nextInner.styles[0].range = nextRange
  const edits = modify(
    text,
    ['materials', 'texts', materialIndex, 'content'],
    JSON.stringify(nextInner),
    { formattingOptions: { insertSpaces: false, tabSize: 2, eol: '\n' } }
  )
  const updatedText = applyEdits(text, edits)
  const after = parseJsonObject(updatedText, label)
  assertOnlyAllowedTextFieldsChanged(before, after, materialId, nextText, nextRange)
  return Buffer.from(updatedText, 'utf8')
}

function parseManifest(value: unknown, expectedId: string): WorkingCopyManifest {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.workingCopyId !== expectedId ||
    typeof value.sourceDraftName !== 'string' ||
    typeof value.createdAt !== 'string' ||
    !isFileHashes(value.sourceHashes)
  ) {
    throw new Error('工作副本标记无效')
  }
  return value as unknown as WorkingCopyManifest
}

function parseTransaction(
  value: unknown,
  workingCopyId: string,
  transactionId: string
): TransactionMetadata {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.workingCopyId !== workingCopyId ||
    value.transactionId !== transactionId ||
    typeof value.segmentId !== 'string' ||
    typeof value.materialId !== 'string' ||
    typeof value.currentText !== 'string' ||
    typeof value.nextText !== 'string' ||
    !isFileHashes(value.beforeHashes) ||
    !isFileHashes(value.afterHashes) ||
    typeof value.createdAt !== 'string' ||
    !['prepared', 'applied', 'auto-rolled-back', 'rolled-back'].includes(String(value.status))
  ) {
    throw new Error('草稿事务记录无效')
  }
  return value as unknown as TransactionMetadata
}

export class JianyingWorkingCopyService {
  private readonly sourceDrafts: JianyingReadService
  private readonly workingCopyRoot: string | null
  private readonly isJianyingRunning: () => boolean
  private readonly now: () => number
  private readonly createId: () => string
  private readonly failPoint?: (point: FailPoint) => void
  private readonly pendingChanges = new Map<string, PendingTextChange>()

  constructor(options: JianyingWorkingCopyServiceOptions) {
    this.sourceDrafts = options.sourceDrafts
    this.workingCopyRoot = options.workingCopyRoot ? resolve(options.workingCopyRoot) : null
    this.isJianyingRunning = options.isJianyingRunning ?? defaultIsJianyingRunning
    this.now = options.now ?? Date.now
    this.createId = options.createId ?? randomUUID
    this.failPoint = options.failPoint
  }

  get enabled(): boolean {
    return this.workingCopyRoot !== null
  }

  async prepareWorkingCopy(sourceDraftName: string): Promise<JianyingWorkingCopyPrepared> {
    this.assertEditorClosed()
    const sourcePath = await this.sourceDrafts.resolveDraftPath(sourceDraftName)
    const inspection = await this.sourceDrafts.inspectDraft(sourceDraftName)
    if (!inspection.mirrorsInSync) throw new Error('源草稿的两个时间线镜像不一致')
    const root = await this.ensureWorkingRoot()
    const workingCopyId = this.validGeneratedId()
    const target = join(root, workingCopyId)

    try {
      await cp(sourcePath, target, {
        recursive: true,
        force: false,
        errorOnExist: true,
        dereference: false,
        verbatimSymlinks: true
      })
      const sourcePair = await this.readDraftPair(sourcePath)
      const copiedPair = await this.readDraftPair(target)
      if (!isDeepStrictEqual(copiedPair.hashes, sourcePair.hashes)) {
        throw new Error('工作副本与源草稿原始字节不一致')
      }
      const createdAt = new Date(this.now()).toISOString()
      const manifest: WorkingCopyManifest = {
        schemaVersion: 1,
        workingCopyId,
        sourceDraftName,
        createdAt,
        sourceHashes: sourcePair.hashes
      }
      await replaceAtomic(
        join(target, WORKING_COPY_MANIFEST),
        `${JSON.stringify(manifest, null, 2)}\n`
      )
      return {
        workingCopyId,
        sourceDraftName,
        createdAt,
        sourceHashes: sourcePair.hashes,
        writesPerformed: true
      }
    } catch (error) {
      await this.removeNewWorkingCopy(root, target)
      throw error
    }
  }

  async previewTextChange(
    workingCopyId: string,
    segmentId: string,
    nextText: string
  ): Promise<JianyingWorkingCopyTextPreview> {
    const normalizedText = nextText.trim()
    if (!normalizedText) throw new Error('字幕文本不能为空')
    if (normalizedText.length > 20_000) throw new Error('字幕文本长度超过 20,000 字符')
    const { path } = await this.resolveWorkingCopy(workingCopyId)
    const pair = await this.readDraftPair(path)
    const { material, segment } = findTextMaterial(pair.draft, segmentId)
    const current = readTextState(material)
    const proposedStyleRange: [number, number] = [0, normalizedText.length]
    const previewToken = this.validGeneratedId()
    const expiresAt = this.now() + DEFAULT_PREVIEW_TTL_MS
    this.removeExpiredPreviews()
    this.pendingChanges.set(previewToken, {
      workingCopyId,
      segmentId: segment.id,
      materialId: material.id,
      currentText: current.text,
      nextText: normalizedText,
      proposedStyleRange,
      beforeHashes: pair.hashes,
      expiresAt
    })
    return {
      previewToken,
      workingCopyId,
      segmentId: segment.id,
      currentText: current.text,
      nextText: normalizedText,
      currentStyleRange: current.range,
      proposedStyleRange,
      beforeHashes: pair.hashes,
      expiresAt: new Date(expiresAt).toISOString(),
      writesPerformed: false
    }
  }

  async applyTextChange(previewToken: string): Promise<JianyingTextChangeApplied> {
    const pending = this.pendingChanges.get(previewToken)
    this.pendingChanges.delete(previewToken)
    if (!pending) throw new Error('变更预览不存在或已使用')
    if (pending.expiresAt <= this.now()) throw new Error('变更预览已过期，请重新预览')
    this.assertEditorClosed()
    const { path } = await this.resolveWorkingCopy(pending.workingCopyId)
    const before = await this.readDraftPair(path)
    if (!isDeepStrictEqual(before.hashes, pending.beforeHashes)) {
      throw new Error('工作副本在预览后已变更，请重新预览')
    }
    const located = findTextMaterial(before.draft, pending.segmentId)
    const current = readTextState(located.material)
    if (located.material.id !== pending.materialId || current.text !== pending.currentText) {
      throw new Error('目标字幕在预览后已变更')
    }

    const updatedRaw: Record<TargetFileName, Buffer> = {
      'draft_content.json': editTextMaterial(
        before.raw['draft_content.json'],
        pending.materialId,
        pending.nextText,
        pending.proposedStyleRange,
        'draft_content.json'
      ),
      'template-2.tmp': editTextMaterial(
        before.raw['template-2.tmp'],
        pending.materialId,
        pending.nextText,
        pending.proposedStyleRange,
        'template-2.tmp'
      )
    }
    const afterHashes = fileHashes(updatedRaw)
    if (
      semanticHash(parseJsonObject(updatedRaw['draft_content.json'], 'draft_content.json')) !==
      semanticHash(parseJsonObject(updatedRaw['template-2.tmp'], 'template-2.tmp'))
    ) {
      throw new Error('变更后的两个时间线镜像不一致')
    }

    const transactionId = this.validGeneratedId()
    const backupPath = await this.createBackup(path, transactionId, before.raw)
    let targetsMayHaveChanged = false
    const metadata: TransactionMetadata = {
      schemaVersion: 1,
      transactionId,
      workingCopyId: pending.workingCopyId,
      segmentId: pending.segmentId,
      materialId: pending.materialId,
      currentText: pending.currentText,
      nextText: pending.nextText,
      beforeHashes: before.hashes,
      afterHashes,
      createdAt: new Date(this.now()).toISOString(),
      status: 'prepared'
    }
    await replaceAtomic(
      join(backupPath, 'transaction.json'),
      `${JSON.stringify(metadata, null, 2)}\n`
    )

    try {
      targetsMayHaveChanged = true
      await replaceAtomic(join(path, 'draft_content.json'), updatedRaw['draft_content.json'])
      this.failPoint?.('after-canonical-replace')
      await replaceAtomic(join(path, 'template-2.tmp'), updatedRaw['template-2.tmp'])
      this.failPoint?.('after-mirror-replace')
      const verified = await this.readDraftPair(path)
      if (!isDeepStrictEqual(verified.hashes, afterHashes))
        throw new Error('写入后文件哈希校验失败')
      metadata.status = 'applied'
      await replaceAtomic(
        join(backupPath, 'transaction.json'),
        `${JSON.stringify(metadata, null, 2)}\n`
      )
      return {
        transactionId,
        workingCopyId: pending.workingCopyId,
        segmentId: pending.segmentId,
        beforeHashes: before.hashes,
        afterHashes,
        changedFields: [
          'materials.texts[].content.text',
          'materials.texts[].content.styles[0].range'
        ],
        backupCreated: true,
        writesPerformed: true
      }
    } catch (error) {
      if (!targetsMayHaveChanged) throw error
      try {
        await this.restoreRaw(path, before.raw)
        const restored = await this.readDraftPair(path)
        if (!isDeepStrictEqual(restored.hashes, before.hashes)) throw new Error('回滚后哈希不一致')
        metadata.status = 'auto-rolled-back'
        await replaceAtomic(
          join(backupPath, 'transaction.json'),
          `${JSON.stringify(metadata, null, 2)}\n`
        )
      } catch (rollbackError) {
        const detail = rollbackError instanceof Error ? rollbackError.message : '未知错误'
        throw new Error(`草稿写入失败且自动回滚失败：${detail}`)
      }
      const detail = error instanceof Error ? error.message : '未知错误'
      throw new Error(`草稿写入失败，已自动回滚：${detail}`)
    }
  }

  async rollbackTextChange(
    workingCopyId: string,
    transactionId: string
  ): Promise<JianyingTextChangeRolledBack> {
    this.assertEditorClosed()
    const { path } = await this.resolveWorkingCopy(workingCopyId)
    const backupPath = await this.resolveBackup(path, transactionId)
    const metadata = parseTransaction(
      JSON.parse(await readFile(join(backupPath, 'transaction.json'), 'utf8')) as unknown,
      workingCopyId,
      transactionId
    )
    if (metadata.status !== 'applied') throw new Error('只能回滚已成功应用的事务')
    const current = await this.readDraftPair(path)
    if (!isDeepStrictEqual(current.hashes, metadata.afterHashes)) {
      throw new Error('草稿在该事务后已变更，已拒绝覆盖')
    }
    const originals: Record<TargetFileName, Buffer> = {
      'draft_content.json': await readFile(join(backupPath, 'draft_content.json.original')),
      'template-2.tmp': await readFile(join(backupPath, 'template-2.tmp.original'))
    }
    if (!isDeepStrictEqual(fileHashes(originals), metadata.beforeHashes)) {
      throw new Error('原始字节备份哈希校验失败')
    }
    await this.restoreRaw(path, originals)
    const restored = await this.readDraftPair(path)
    if (!isDeepStrictEqual(restored.hashes, metadata.beforeHashes))
      throw new Error('回滚后哈希校验失败')
    metadata.status = 'rolled-back'
    await replaceAtomic(
      join(backupPath, 'transaction.json'),
      `${JSON.stringify(metadata, null, 2)}\n`
    )
    return { transactionId, workingCopyId, restoredHashes: restored.hashes, rolledBack: true }
  }

  private assertEditorClosed(): void {
    if (this.isJianyingRunning()) throw new Error('检测到剪映正在运行，已拒绝草稿操作')
  }

  private validGeneratedId(): string {
    const id = this.createId()
    if (!MANAGED_ID_PATTERN.test(id)) throw new Error('内部工作副本 ID 无效')
    return id
  }

  private async ensureWorkingRoot(): Promise<string> {
    if (!this.workingCopyRoot) throw new Error('尚未配置剪映工作副本目录')
    const sourceRoot = this.sourceDrafts.configuredDraftRoot
    if (!sourceRoot) throw new Error('尚未配置剪映草稿根目录')
    const source = await realpath(sourceRoot)
    const prospectiveRoot = await resolveProspectivePath(this.workingCopyRoot)
    if (isPathInside(source, prospectiveRoot) || isPathInside(prospectiveRoot, source)) {
      throw new Error('工作副本目录必须与真实草稿根完全隔离')
    }
    await mkdir(this.workingCopyRoot, { recursive: true })
    const root = await realpath(this.workingCopyRoot)
    if (isPathInside(source, root) || isPathInside(root, source)) {
      throw new Error('工作副本目录必须与真实草稿根完全隔离')
    }
    return root
  }

  private async resolveWorkingCopy(workingCopyId: string): Promise<{
    path: string
    manifest: WorkingCopyManifest
  }> {
    if (!MANAGED_ID_PATTERN.test(workingCopyId)) throw new Error('工作副本 ID 无效')
    const root = await this.ensureWorkingRoot()
    const target = await realpath(join(root, workingCopyId)).catch(() => {
      throw new Error('指定工作副本不存在')
    })
    const path = relative(root, target)
    if (
      !path ||
      path === '..' ||
      path.startsWith(`..${sep}`) ||
      isAbsolute(path) ||
      dirname(target) !== root
    ) {
      throw new Error('工作副本路径超出允许范围')
    }
    const manifestPath = join(target, WORKING_COPY_MANIFEST)
    await assertRegularFile(manifestPath, '工作副本标记')
    const manifest = parseManifest(
      JSON.parse(await readFile(manifestPath, 'utf8')) as unknown,
      workingCopyId
    )
    return { path: target, manifest }
  }

  private async readDraftPair(path: string): Promise<DraftPair> {
    const canonicalPath = join(path, 'draft_content.json')
    const mirrorPath = join(path, 'template-2.tmp')
    await Promise.all([
      assertRegularFile(canonicalPath, 'draft_content.json'),
      assertRegularFile(mirrorPath, 'template-2.tmp')
    ])
    const [canonical, mirror] = await Promise.all([readFile(canonicalPath), readFile(mirrorPath)])
    const canonicalJson = parseJsonObject(canonical, 'draft_content.json')
    const mirrorJson = parseJsonObject(mirror, 'template-2.tmp')
    if (semanticHash(canonicalJson) !== semanticHash(mirrorJson)) {
      throw new Error('两个时间线镜像不一致')
    }
    const { draft } = loadDraft(path)
    assertJianying59Draft(draft)
    const raw = { 'draft_content.json': canonical, 'template-2.tmp': mirror }
    return { path, raw, hashes: fileHashes(raw), draft }
  }

  private async createBackup(
    workingCopyPath: string,
    transactionId: string,
    raw: Record<TargetFileName, Buffer>
  ): Promise<string> {
    const backupRoot = join(workingCopyPath, BACKUP_DIRECTORY)
    await mkdir(backupRoot, { recursive: true })
    const backupRootStatus = await lstat(backupRoot)
    if (!backupRootStatus.isDirectory() || backupRootStatus.isSymbolicLink()) {
      throw new Error('备份目录无效')
    }
    const backupPath = join(backupRoot, transactionId)
    await mkdir(backupPath)
    try {
      await Promise.all([
        writeDurable(join(backupPath, 'draft_content.json.original'), raw['draft_content.json']),
        writeDurable(join(backupPath, 'template-2.tmp.original'), raw['template-2.tmp'])
      ])
      return backupPath
    } catch (error) {
      await rm(backupPath, { recursive: true, force: true })
      throw error
    }
  }

  private async resolveBackup(workingCopyPath: string, transactionId: string): Promise<string> {
    if (!MANAGED_ID_PATTERN.test(transactionId)) throw new Error('事务 ID 无效')
    const backupRoot = await realpath(join(workingCopyPath, BACKUP_DIRECTORY)).catch(() => {
      throw new Error('备份目录不存在')
    })
    const backupPath = await realpath(join(backupRoot, transactionId)).catch(() => {
      throw new Error('指定草稿事务不存在')
    })
    if (dirname(backupPath) !== backupRoot) throw new Error('事务备份路径超出允许范围')
    await Promise.all([
      assertRegularFile(join(backupPath, 'transaction.json'), '草稿事务记录'),
      assertRegularFile(join(backupPath, 'draft_content.json.original'), 'draft_content.json 备份'),
      assertRegularFile(join(backupPath, 'template-2.tmp.original'), 'template-2.tmp 备份')
    ])
    return backupPath
  }

  private async restoreRaw(
    workingCopyPath: string,
    raw: Record<TargetFileName, Buffer>
  ): Promise<void> {
    await replaceAtomic(join(workingCopyPath, 'draft_content.json'), raw['draft_content.json'])
    await replaceAtomic(join(workingCopyPath, 'template-2.tmp'), raw['template-2.tmp'])
  }

  private async removeNewWorkingCopy(root: string, target: string): Promise<void> {
    if (dirname(target) !== root || !MANAGED_ID_PATTERN.test(basename(target))) return
    await rm(target, { recursive: true, force: true })
  }

  private removeExpiredPreviews(): void {
    const now = this.now()
    for (const [token, pending] of this.pendingChanges) {
      if (pending.expiresAt <= now) this.pendingChanges.delete(token)
    }
  }
}
