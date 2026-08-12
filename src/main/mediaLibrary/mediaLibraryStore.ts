import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, normalize, resolve } from 'node:path'

import type { GlobalMediaAsset, GlobalMediaKind } from '../../shared/mediaLibrary'

interface MediaLibraryIndex {
  version: 1
  assets: GlobalMediaAsset[]
  needsMigration?: boolean
}

interface MediaLibraryStoreDependencies {
  createId: () => string
  now: () => Date
}

export interface MediaLibraryImportResult {
  assets: GlobalMediaAsset[]
  importedCount: number
  duplicateCount: number
  unsupportedCount: number
}

const MEDIA_EXTENSIONS: Record<GlobalMediaKind, ReadonlySet<string>> = {
  video: new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v']),
  audio: new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg']),
  image: new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])
}

const defaultDependencies: MediaLibraryStoreDependencies = {
  createId: randomUUID,
  now: () => new Date()
}

function getMediaKind(filePath: string): GlobalMediaKind | null {
  const extension = extname(filePath).toLowerCase()

  for (const [kind, extensions] of Object.entries(MEDIA_EXTENSIONS)) {
    if (extensions.has(extension)) return kind as GlobalMediaKind
  }

  return null
}

function getPathKey(filePath: string): string {
  const normalizedPath = normalize(resolve(filePath))
  return process.platform === 'win32' ? normalizedPath.toLocaleLowerCase('en-US') : normalizedPath
}

function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
}

function isGlobalMediaAsset(value: unknown): value is GlobalMediaAsset {
  if (!value || typeof value !== 'object') return false
  const asset = value as Partial<GlobalMediaAsset>

  return (
    typeof asset.id === 'string' &&
    typeof asset.name === 'string' &&
    typeof asset.sourcePath === 'string' &&
    (asset.kind === 'video' || asset.kind === 'audio' || asset.kind === 'image') &&
    typeof asset.sizeBytes === 'number' &&
    typeof asset.fileModifiedAt === 'string' &&
    typeof asset.importedAt === 'string' &&
    (asset.availability === 'available' || asset.availability === 'missing') &&
    (asset.tags === undefined ||
      (Array.isArray(asset.tags) && asset.tags.every((tag) => typeof tag === 'string')))
  )
}

function parseIndex(source: string): MediaLibraryIndex {
  const parsed = JSON.parse(source) as Partial<MediaLibraryIndex>

  if (
    parsed.version !== 1 ||
    !Array.isArray(parsed.assets) ||
    !parsed.assets.every(isGlobalMediaAsset)
  ) {
    throw new Error('素材库索引格式无效')
  }

  const needsMigration = parsed.assets.some((asset) => {
    const originalTags = asset.tags
    const normalizedTags = normalizeTags(originalTags ?? [])
    return (
      originalTags === undefined ||
      normalizedTags.length !== originalTags.length ||
      normalizedTags.some((tag, index) => tag !== originalTags[index])
    )
  })

  return {
    version: 1,
    assets: parsed.assets.map((asset) => ({ ...asset, tags: normalizeTags(asset.tags ?? []) })),
    needsMigration
  }
}

export class GlobalMediaLibraryStore {
  private readonly dependencies: MediaLibraryStoreDependencies
  private operation: Promise<void> = Promise.resolve()

  constructor(
    private readonly indexPath: string,
    dependencies: Partial<MediaLibraryStoreDependencies> = {}
  ) {
    this.dependencies = { ...defaultDependencies, ...dependencies }
  }

  list(): Promise<GlobalMediaAsset[]> {
    return this.enqueue(async () => {
      const index = await this.readIndex()
      let changed = false

      const assets = await Promise.all(
        index.assets.map(async (asset): Promise<GlobalMediaAsset> => {
          try {
            const fileStats = await stat(asset.sourcePath)
            if (!fileStats.isFile()) throw new Error('素材来源不是文件')

            const refreshedAsset: GlobalMediaAsset = {
              ...asset,
              tags: normalizeTags(asset.tags),
              sizeBytes: fileStats.size,
              fileModifiedAt: fileStats.mtime.toISOString(),
              availability: 'available'
            }
            if (
              refreshedAsset.sizeBytes !== asset.sizeBytes ||
              refreshedAsset.fileModifiedAt !== asset.fileModifiedAt ||
              refreshedAsset.availability !== asset.availability ||
              refreshedAsset.tags.length !== asset.tags.length ||
              refreshedAsset.tags.some((tag, index) => tag !== asset.tags[index])
            ) {
              changed = true
            }
            return refreshedAsset
          } catch {
            if (asset.availability !== 'missing') changed = true
            return { ...asset, availability: 'missing' }
          }
        })
      )

      if (changed || index.needsMigration) {
        await this.writeIndex({ version: 1, assets })
      }
      return assets
    })
  }

  importFiles(filePaths: readonly string[]): Promise<MediaLibraryImportResult> {
    return this.enqueue(async () => {
      const index = await this.readIndex()
      const assets = [...index.assets]
      const assetsByPath = new Map(assets.map((asset) => [getPathKey(asset.sourcePath), asset]))
      let importedCount = 0
      let duplicateCount = 0
      let unsupportedCount = 0
      let changed = false

      for (const sourcePath of filePaths) {
        const kind = getMediaKind(sourcePath)
        if (!kind) {
          unsupportedCount += 1
          continue
        }

        let fileStats
        try {
          fileStats = await stat(sourcePath)
          if (!fileStats.isFile()) throw new Error('素材来源不是文件')
        } catch {
          unsupportedCount += 1
          continue
        }

        const pathKey = getPathKey(sourcePath)
        const existingAsset = assetsByPath.get(pathKey)
        if (existingAsset) {
          existingAsset.name = basename(sourcePath)
          existingAsset.sizeBytes = fileStats.size
          existingAsset.fileModifiedAt = fileStats.mtime.toISOString()
          existingAsset.availability = 'available'
          duplicateCount += 1
          changed = true
          continue
        }

        const asset: GlobalMediaAsset = {
          id: this.dependencies.createId(),
          name: basename(sourcePath),
          sourcePath,
          kind,
          sizeBytes: fileStats.size,
          fileModifiedAt: fileStats.mtime.toISOString(),
          importedAt: this.dependencies.now().toISOString(),
          availability: 'available',
          tags: []
        }
        assets.push(asset)
        assetsByPath.set(pathKey, asset)
        importedCount += 1
        changed = true
      }

      if (changed || index.needsMigration) {
        await this.writeIndex({ version: 1, assets })
      }

      return { assets, importedCount, duplicateCount, unsupportedCount }
    })
  }

  addTag(assetId: string, tag: string): Promise<GlobalMediaAsset[]> {
    return this.updateTags(assetId, (tags) => normalizeTags([...tags, tag]))
  }

  removeTag(assetId: string, tag: string): Promise<GlobalMediaAsset[]> {
    return this.updateTags(assetId, (tags) => tags.filter((item) => item !== tag.trim()))
  }

  relocateAsset(assetId: string, sourcePath: string): Promise<GlobalMediaAsset> {
    return this.enqueue(async () => {
      const index = await this.readIndex()
      const asset = index.assets.find((item) => item.id === assetId)
      if (!asset) throw new Error('素材记录不存在')
      if (asset.availability !== 'missing') throw new Error('只能重新定位失效素材')
      const pathKey = getPathKey(sourcePath)
      const duplicate = index.assets.find(
        (item) => item.id !== assetId && getPathKey(item.sourcePath) === pathKey
      )
      if (duplicate) throw new Error('素材路径已被其他记录使用')
      const kind = getMediaKind(sourcePath)
      if (!kind) throw new Error('重新定位的文件类型不受支持')
      const fileStats = await stat(sourcePath)
      if (!fileStats.isFile()) throw new Error('素材来源不是文件')
      const relocatedAsset: GlobalMediaAsset = {
        ...asset,
        name: basename(sourcePath),
        sourcePath,
        kind,
        sizeBytes: fileStats.size,
        fileModifiedAt: fileStats.mtime.toISOString(),
        availability: 'available',
        tags: normalizeTags(asset.tags)
      }
      const assets = index.assets.map((item) => (item.id === assetId ? relocatedAsset : item))
      await this.writeIndex({ version: 1, assets })
      return relocatedAsset
    })
  }

  private updateTags(
    assetId: string,
    update: (tags: string[]) => string[]
  ): Promise<GlobalMediaAsset[]> {
    return this.enqueue(async () => {
      const index = await this.readIndex()
      let found = false
      const assets = index.assets.map((asset) => {
        if (asset.id !== assetId) return asset
        found = true
        return { ...asset, tags: update(normalizeTags(asset.tags)) }
      })
      if (!found) throw new Error('素材记录不存在')
      await this.writeIndex({ version: 1, assets })
      return assets
    })
  }

  private async readIndex(): Promise<MediaLibraryIndex> {
    try {
      return parseIndex(await readFile(this.indexPath, 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: 1, assets: [] }
      }
      throw error
    }
  }

  private async writeIndex(index: MediaLibraryIndex): Promise<void> {
    const indexDirectory = dirname(this.indexPath)
    const temporaryPath = `${this.indexPath}.${process.pid}.${randomUUID()}.tmp`
    await mkdir(indexDirectory, { recursive: true })

    try {
      await writeFile(temporaryPath, JSON.stringify(index, null, 2), 'utf8')
      await rename(temporaryPath, this.indexPath)
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation)
    this.operation = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}
