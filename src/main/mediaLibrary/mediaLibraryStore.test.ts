import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
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
})
