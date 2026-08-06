export type NovelJobStatus = 'waiting' | 'running' | 'success' | 'failed'

export interface NovelAudioItem {
  id: string
  fileName: string
  fileSize: number
  durationSeconds: number | null
}

export interface NovelPromotionProject {
  taskName: string

  draftFolder: string
  draftName: string
  draftDetected: boolean

  audioFolder: string
  audioItems: NovelAudioItem[]
  commands: string[]
  autoSubtitle: boolean

  materialFolder: string
  materialCount: number
  uniqueWithinVideo: boolean
  uniqueAcrossVideos: boolean
  allowMaterialReuse: boolean
  materialSegmentSeconds: number

  outputDirectory: string
  outputPrefix: string
  updatedAt: string
}

export interface NovelGenerationJob {
  id: string
  index: number
  audioName: string
  command: string
  durationSeconds: number | null
  outputName: string
  status: NovelJobStatus
  phase: string
}

export interface NovelProjectValidation {
  draftReady: boolean
  audioReady: boolean
  commandsReady: boolean
  materialsReady: boolean
  outputReady: boolean
  canStart: boolean
}
