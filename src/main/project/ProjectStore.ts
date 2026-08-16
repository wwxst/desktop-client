import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'

import type {
  ProjectCreateRequest,
  ProjectDirectories,
  ProjectManifest,
  ProjectSummary
} from '../../shared/project'

interface ProjectIndex {
  version: 1
  projects: ProjectSummary[]
}

interface ProjectStoreDependencies {
  createId: () => string
  now: () => Date
}

const PROJECT_DIRECTORIES: ProjectDirectories = {
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

const defaultDependencies: ProjectStoreDependencies = {
  createId: randomUUID,
  now: () => new Date()
}

function isProjectSummary(value: unknown): value is ProjectSummary {
  if (!value || typeof value !== 'object') return false
  const project = value as Partial<ProjectSummary>
  return (
    typeof project.id === 'string' &&
    Boolean(project.id) &&
    typeof project.name === 'string' &&
    Boolean(project.name) &&
    typeof project.rootDirectory === 'string' &&
    isAbsolute(project.rootDirectory) &&
    typeof project.createdAt === 'string' &&
    !Number.isNaN(Date.parse(project.createdAt)) &&
    typeof project.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(project.updatedAt))
  )
}

function parseIndex(source: string): ProjectIndex {
  const parsed = JSON.parse(source) as Partial<ProjectIndex>
  if (
    parsed.version !== 1 ||
    !Array.isArray(parsed.projects) ||
    !parsed.projects.every(isProjectSummary)
  ) {
    throw new Error('项目索引格式无效')
  }

  const ids = new Set<string>()
  const paths = new Set<string>()
  for (const project of parsed.projects) {
    const pathKey = getPathKey(project.rootDirectory)
    if (ids.has(project.id) || paths.has(pathKey)) throw new Error('项目索引包含重复记录')
    ids.add(project.id)
    paths.add(pathKey)
  }

  return { version: 1, projects: parsed.projects }
}

function getPathKey(path: string): string {
  const normalizedPath = normalize(resolve(path))
  return process.platform === 'win32' ? normalizedPath.toLocaleLowerCase('en-US') : normalizedPath
}

async function readIndex(path: string): Promise<ProjectIndex> {
  try {
    return parseIndex(await readFile(path, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, projects: [] }
    throw error
  }
}

async function assertManifestDoesNotExist(path: string): Promise<void> {
  try {
    await readFile(path, 'utf8')
    throw new Error('所选文件夹已经包含 project.json，请选择其他文件夹')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  await mkdir(dirname(path), { recursive: true })
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, path)
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

export class ProjectStore {
  private readonly dependencies: ProjectStoreDependencies
  private operation: Promise<void> = Promise.resolve()

  constructor(
    private readonly indexPath: string,
    dependencies: Partial<ProjectStoreDependencies> = {}
  ) {
    this.dependencies = { ...defaultDependencies, ...dependencies }
  }

  list(): Promise<ProjectSummary[]> {
    return this.enqueue(async () => [...(await readIndex(this.indexPath)).projects])
  }

  create(request: ProjectCreateRequest): Promise<ProjectSummary[]> {
    return this.enqueue(async () => {
      const name = request.name.trim()
      if (!name) throw new Error('请输入项目名称')
      if (name.length > 120) throw new Error('项目名称不能超过 120 个字符')
      if (!isAbsolute(request.rootDirectory)) throw new Error('项目文件夹路径无效')

      const rootDirectory = resolve(request.rootDirectory)
      const rootStats = await stat(rootDirectory)
      if (!rootStats.isDirectory()) throw new Error('所选路径不是文件夹')

      const index = await readIndex(this.indexPath)
      if (
        index.projects.some(
          (project) => getPathKey(project.rootDirectory) === getPathKey(rootDirectory)
        )
      ) {
        throw new Error('该文件夹已经创建过项目')
      }

      const manifestPath = join(rootDirectory, 'project.json')
      await assertManifestDoesNotExist(manifestPath)

      const timestamp = this.dependencies.now().toISOString()
      const project: ProjectSummary = {
        id: this.dependencies.createId(),
        name,
        rootDirectory,
        createdAt: timestamp,
        updatedAt: timestamp
      }
      const manifest: ProjectManifest = {
        version: 1,
        ...project,
        directories: { ...PROJECT_DIRECTORIES }
      }
      const createdDirectories: string[] = []

      try {
        for (const directory of Object.values(PROJECT_DIRECTORIES)) {
          const created = await mkdir(join(rootDirectory, directory), { recursive: true })
          if (created) createdDirectories.push(join(rootDirectory, directory))
        }
        await writeJsonAtomic(manifestPath, manifest)
        const projects = [...index.projects, project]
        await writeJsonAtomic(this.indexPath, { version: 1, projects } satisfies ProjectIndex)
        return projects
      } catch (error) {
        await rm(manifestPath, { force: true }).catch(() => undefined)
        for (const directory of createdDirectories.reverse()) {
          await rmdir(directory).catch(() => undefined)
        }
        throw error
      }
    })
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
