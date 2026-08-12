import { mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { GlobalMediaLibraryStore } from './mediaLibraryStore'

const temporaryDirectories: string[] = []

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-client-media-library-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('GlobalMediaLibraryStore', () => {
  it('persists supported local media and skips unsupported files', async () => {
    const directory = await createTemporaryDirectory()
    const videoPath = join(directory, 'opening.mp4')
    const audioPath = join(directory, 'voice.wav')
    const notesPath = join(directory, 'notes.txt')
    await Promise.all([
      writeFile(videoPath, 'video'),
      writeFile(audioPath, 'voice'),
      writeFile(notesPath, 'notes')
    ])
    let nextId = 0
    const store = new GlobalMediaLibraryStore(join(directory, 'library.json'), {
      createId: () => `asset-${++nextId}`,
      now: () => new Date('2026-08-11T12:00:00.000Z')
    })

    const result = await store.importFiles([videoPath, audioPath, notesPath])

    expect(result).toMatchObject({
      importedCount: 2,
      duplicateCount: 0,
      unsupportedCount: 1
    })
    expect(result.assets).toEqual([
      expect.objectContaining({
        id: 'asset-1',
        name: 'opening.mp4',
        sourcePath: videoPath,
        kind: 'video',
        availability: 'available'
      }),
      expect.objectContaining({
        id: 'asset-2',
        name: 'voice.wav',
        sourcePath: audioPath,
        kind: 'audio',
        availability: 'available'
      })
    ])

    const reloadedStore = new GlobalMediaLibraryStore(join(directory, 'library.json'))
    await expect(reloadedStore.list()).resolves.toEqual(result.assets)
  })

  it('keeps one record when the same source path is imported again', async () => {
    const directory = await createTemporaryDirectory()
    const videoPath = join(directory, 'repeat.mp4')
    await writeFile(videoPath, 'video')
    const store = new GlobalMediaLibraryStore(join(directory, 'library.json'), {
      createId: () => 'asset-1',
      now: () => new Date('2026-08-11T12:00:00.000Z')
    })

    await store.importFiles([videoPath])
    const result = await store.importFiles([videoPath])

    expect(result).toMatchObject({
      importedCount: 0,
      duplicateCount: 1,
      unsupportedCount: 0
    })
    expect(result.assets).toHaveLength(1)
  })

  it('marks an indexed source as missing when refresh can no longer stat it', async () => {
    const directory = await createTemporaryDirectory()
    const imagePath = join(directory, 'cover.png')
    await writeFile(imagePath, 'image')
    const store = new GlobalMediaLibraryStore(join(directory, 'library.json'), {
      createId: () => 'asset-1',
      now: () => new Date('2026-08-11T12:00:00.000Z')
    })

    await store.importFiles([imagePath])
    await unlink(imagePath)

    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({
        id: 'asset-1',
        availability: 'missing'
      })
    ])
  })

  it('loads legacy indexes without tags and persists normalized tag changes', async () => {
    const directory = await createTemporaryDirectory()
    const imagePath = join(directory, 'cover.png')
    await writeFile(imagePath, 'image')
    await writeFile(
      join(directory, 'library.json'),
      JSON.stringify({
        version: 1,
        assets: [
          {
            id: 'asset-1',
            name: 'cover.png',
            sourcePath: imagePath,
            kind: 'image',
            sizeBytes: 5,
            fileModifiedAt: '2026-08-11T11:00:00.000Z',
            importedAt: '2026-08-11T12:00:00.000Z',
            availability: 'available'
          }
        ]
      })
    )
    const store = new GlobalMediaLibraryStore(join(directory, 'library.json'))

    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({ id: 'asset-1', tags: [] })
    ])
    const persistedIndex = JSON.parse(await readFile(join(directory, 'library.json'), 'utf8')) as {
      assets: Array<{ tags?: string[] }>
    }
    expect(persistedIndex.assets[0].tags).toEqual([])

    await store.addTag('asset-1', '  封面  ')
    await store.addTag('asset-1', '封面')
    await store.addTag('asset-1', '  重点  ')
    await store.removeTag('asset-1', '封面')

    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({ id: 'asset-1', tags: ['重点'] })
    ])
  })

  it('rewrites already-stat-able legacy metadata with normalized tags', async () => {
    const directory = await createTemporaryDirectory()
    const imagePath = join(directory, 'cover.png')
    await writeFile(imagePath, 'image')
    const fileStats = await stat(imagePath)
    await writeFile(
      join(directory, 'library.json'),
      JSON.stringify({
        version: 1,
        assets: [
          {
            id: 'asset-1',
            name: 'cover.png',
            sourcePath: imagePath,
            kind: 'image',
            sizeBytes: fileStats.size,
            fileModifiedAt: fileStats.mtime.toISOString(),
            importedAt: '2026-08-11T12:00:00.000Z',
            availability: 'available',
            tags: ['  封面  ', '封面']
          }
        ]
      })
    )
    const store = new GlobalMediaLibraryStore(join(directory, 'library.json'))

    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({ id: 'asset-1', tags: ['封面'] })
    ])
    const persistedIndex = JSON.parse(await readFile(join(directory, 'library.json'), 'utf8')) as {
      assets: Array<{ tags?: string[] }>
    }
    expect(persistedIndex.assets[0].tags).toEqual(['封面'])
  })

  it('persists legacy tag migration when an import makes no other changes', async () => {
    const directory = await createTemporaryDirectory()
    const indexPath = join(directory, 'library.json')
    await writeFile(
      indexPath,
      JSON.stringify({
        version: 1,
        assets: [
          {
            id: 'asset-1',
            name: 'missing.png',
            sourcePath: join(directory, 'missing.png'),
            kind: 'image',
            sizeBytes: 5,
            fileModifiedAt: '2026-08-11T11:00:00.000Z',
            importedAt: '2026-08-11T12:00:00.000Z',
            availability: 'missing'
          }
        ]
      })
    )
    const store = new GlobalMediaLibraryStore(indexPath)

    await store.importFiles([])

    const persistedIndex = JSON.parse(await readFile(indexPath, 'utf8')) as {
      assets: Array<{ tags?: string[] }>
    }
    expect(persistedIndex.assets[0].tags).toEqual([])
  })

  it('relocates a missing asset while preserving its identity and import time', async () => {
    const directory = await createTemporaryDirectory()
    const originalPath = join(directory, 'before.png')
    const relocatedPath = join(directory, 'after.jpg')
    await writeFile(originalPath, 'image')
    await writeFile(relocatedPath, 'new image')
    const store = new GlobalMediaLibraryStore(join(directory, 'library.json'), {
      createId: () => 'asset-1',
      now: () => new Date('2026-08-11T12:00:00.000Z')
    })

    const imported = await store.importFiles([originalPath])
    await unlink(originalPath)
    await store.list()

    const relocated = await store.relocateAsset('asset-1', relocatedPath)

    expect(relocated).toMatchObject({
      id: 'asset-1',
      importedAt: imported.assets[0].importedAt,
      sourcePath: relocatedPath,
      name: 'after.jpg',
      kind: 'image',
      availability: 'available'
    })
  })

  it('rejects relocating an asset onto another indexed source path', async () => {
    const directory = await createTemporaryDirectory()
    const firstPath = join(directory, 'first.mp4')
    const secondPath = join(directory, 'second.mp4')
    await Promise.all([writeFile(firstPath, 'first'), writeFile(secondPath, 'second')])
    const store = new GlobalMediaLibraryStore(join(directory, 'library.json'), {
      createId: (() => {
        let index = 0
        return () => `asset-${++index}`
      })()
    })

    await store.importFiles([firstPath, secondPath])
    await unlink(firstPath)
    await store.list()

    await expect(store.relocateAsset('asset-1', secondPath)).rejects.toThrow(
      '素材路径已被其他记录使用'
    )
  })

  it('only relocates assets currently marked missing', async () => {
    const directory = await createTemporaryDirectory()
    const imagePath = join(directory, 'cover.png')
    await writeFile(imagePath, 'image')
    const store = new GlobalMediaLibraryStore(join(directory, 'library.json'), {
      createId: () => 'asset-1'
    })

    await store.importFiles([imagePath])

    await expect(store.relocateAsset('asset-1', imagePath)).rejects.toThrow('只能重新定位失效素材')
  })
})
