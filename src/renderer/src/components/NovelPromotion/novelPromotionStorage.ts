import type { NovelPromotionProject, NovelProjectValidation } from './novelPromotionTypes'

export const NOVEL_PROJECT_STORAGE_KEY = 'desktop-client:novel-promotion-project:v2'
export const NOVEL_PROJECT_CHANGED_EVENT = 'novel-promotion:project-changed'

export function createDefaultNovelProject(): NovelPromotionProject {
  return {
    taskName: '小说推文批量任务',

    draftFolder: '',
    draftName: '',
    draftDetected: false,

    audioFolder: '',
    audioItems: [],
    commands: [],
    autoSubtitle: true,

    materialFolder: '',
    materialCount: 0,
    uniqueWithinVideo: true,
    uniqueAcrossVideos: true,
    allowMaterialReuse: true,
    materialSegmentSeconds: 5,

    outputDirectory: '',
    outputPrefix: '',
    updatedAt: new Date().toISOString()
  }
}

export function loadNovelProject(): NovelPromotionProject {
  try {
    const raw = window.localStorage.getItem(NOVEL_PROJECT_STORAGE_KEY)
    if (!raw) {
      return createDefaultNovelProject()
    }

    const saved = JSON.parse(raw) as Partial<NovelPromotionProject>
    return {
      ...createDefaultNovelProject(),
      ...saved,
      audioItems: Array.isArray(saved.audioItems) ? saved.audioItems : [],
      commands: Array.isArray(saved.commands) ? saved.commands : []
    }
  } catch (error) {
    console.error('读取小说推文任务失败：', error)
    return createDefaultNovelProject()
  }
}

export function saveNovelProject(project: NovelPromotionProject): void {
  try {
    window.localStorage.setItem(NOVEL_PROJECT_STORAGE_KEY, JSON.stringify(project))
    window.dispatchEvent(
      new CustomEvent<NovelPromotionProject>(NOVEL_PROJECT_CHANGED_EVENT, {
        detail: project
      })
    )
  } catch (error) {
    console.error('保存小说推文任务失败：', error)
  }
}

export function validateNovelProject(project: NovelPromotionProject): NovelProjectValidation {
  const draftReady = Boolean(
    project.draftDetected && project.draftFolder.trim() && project.draftName.trim()
  )
  const audioReady = project.audioItems.length > 0
  const commandsReady =
    audioReady &&
    project.commands.length === project.audioItems.length &&
    project.commands.every((command) => command.trim().length > 0)
  const materialsReady = Boolean(project.materialFolder.trim() && project.materialCount > 0)
  const outputReady = Boolean(project.outputDirectory.trim())

  return {
    draftReady,
    audioReady,
    commandsReady,
    materialsReady,
    outputReady,
    canStart: draftReady && audioReady && commandsReady && materialsReady && outputReady
  }
}

export function buildOutputName(
  project: NovelPromotionProject,
  index: number,
  now = new Date()
): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const sequence = String(index + 1).padStart(3, '0')
  const prefix = project.outputPrefix.trim()

  return `${prefix ? `${prefix}_` : ''}${date}_${sequence}.mp4`
}
