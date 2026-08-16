import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { ProjectManifest } from '../../shared/project'
import { ProjectStore } from './ProjectStore'

const temporaryDirectories: string[] = []

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-client-project-'))
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

describe('ProjectStore', () => {
  it('creates the project structure and reloads it from the persistent index', async () => {
    const userDataDirectory = await createTemporaryDirectory()
    const projectDirectory = join(userDataDirectory, 'my-project')
    await mkdir(projectDirectory)
    const indexPath = join(userDataDirectory, 'projects', 'index.json')
    const store = new ProjectStore(indexPath, {
      createId: () => 'project-1',
      now: () => new Date('2026-08-16T09:00:00.000Z')
    })

    const projects = await store.create({ name: ' 测试项目 ', rootDirectory: projectDirectory })

    expect(projects).toEqual([
      {
        id: 'project-1',
        name: '测试项目',
        rootDirectory: projectDirectory,
        createdAt: '2026-08-16T09:00:00.000Z',
        updatedAt: '2026-08-16T09:00:00.000Z'
      }
    ])
    const manifest = JSON.parse(
      await readFile(join(projectDirectory, 'project.json'), 'utf8')
    ) as ProjectManifest
    expect(manifest).toMatchObject({
      version: 1,
      id: 'project-1',
      name: '测试项目',
      directories: {
        text: 'text',
        audio: 'audio',
        subtitles: 'subtitles',
        materials: 'materials',
        output: 'output',
        cache: 'cache',
        backups: 'backups',
        batches: 'batches',
        logs: 'logs'
      }
    })
    for (const directory of Object.values(manifest.directories)) {
      await expect(stat(join(projectDirectory, directory))).resolves.toMatchObject({})
    }

    const reloadedStore = new ProjectStore(indexPath)
    await expect(reloadedStore.list()).resolves.toEqual(projects)
  })

  it('does not overwrite an existing project manifest', async () => {
    const userDataDirectory = await createTemporaryDirectory()
    const projectDirectory = join(userDataDirectory, 'existing-project')
    const manifestPath = join(projectDirectory, 'project.json')
    await mkdir(projectDirectory)
    await writeFile(manifestPath, '{"foreign":true}', 'utf8')
    const store = new ProjectStore(join(userDataDirectory, 'projects', 'index.json'))

    await expect(
      store.create({ name: '测试项目', rootDirectory: projectDirectory })
    ).rejects.toThrow('已经包含 project.json')
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe('{"foreign":true}')
    await expect(store.list()).resolves.toEqual([])
  })

  it('keeps a damaged index untouched instead of replacing it', async () => {
    const userDataDirectory = await createTemporaryDirectory()
    const projectDirectory = join(userDataDirectory, 'new-project')
    const indexPath = join(userDataDirectory, 'projects', 'index.json')
    await mkdir(projectDirectory)
    await mkdir(join(userDataDirectory, 'projects'))
    await writeFile(indexPath, '{"version":999}', 'utf8')
    const store = new ProjectStore(indexPath)

    await expect(
      store.create({ name: '测试项目', rootDirectory: projectDirectory })
    ).rejects.toThrow('项目索引格式无效')
    await expect(readFile(indexPath, 'utf8')).resolves.toBe('{"version":999}')
  })
})
