/**
 * 本地 TTS 共用类型。
 *
 * 这些类型会同时被 React 渲染进程、preload 和 Electron 主进程使用，
 * 相当于前后端之间约定好的 DTO / VO。
 */

export type TtsModelEngine = 'kokoro' | 'supertonic'

export type TtsModelStatus =
  | 'not-installed'
  | 'downloading'
  | 'extracting'
  | 'installed'
  | 'failed'

export type TtsVoiceGender = 'female' | 'male' | 'unknown'

export type TtsJobStatus =
  | 'queued'
  | 'preparing'
  | 'generating'
  | 'merging'
  | 'completed'
  | 'cancelled'
  | 'failed'

export interface TtsLanguageInfo {
  code: string
  name: string
  englishName: string
}

export interface TtsVoice {
  id: string
  modelId: string
  speakerId: number
  name: string
  originalName: string
  languageCodes: string[]
  gender: TtsVoiceGender
  accent?: string
  description: string
}

export interface TtsModelInfo {
  id: string
  name: string
  description: string
  engine: TtsModelEngine
  licenseName: string
  licenseNote: string
  languages: string[]
  voiceCount: number
  estimatedDownloadMb: number
  status: TtsModelStatus
  statusMessage: string
  voices: TtsVoice[]
}

export interface TtsCatalogResponse {
  success: boolean
  message: string
  languages: TtsLanguageInfo[]
  models: TtsModelInfo[]
  modelDirectory: string
}

export interface TtsModelActionResponse {
  success: boolean
  message: string
}

export interface TtsModelDownloadProgress {
  modelId: string
  phase: 'downloading' | 'extracting' | 'completed' | 'failed'
  receivedBytes: number
  totalBytes: number
  percent: number
  message: string
}

export interface TtsGenerateRequest {
  text: string
  language: string
  modelId: string
  voiceId: string
  speed: number
}

export interface TtsPreviewResponse {
  success: boolean
  message: string
  audioBytes?: Uint8Array
  mimeType?: 'audio/wav'
  durationSeconds?: number
  sampleRate?: number
}

export interface TtsCreateJobResponse {
  success: boolean
  message: string
  jobId?: string
  totalSegments?: number
}

export interface TtsJobProgress {
  jobId: string
  modelId: string
  status: TtsJobStatus
  currentSegment: number
  totalSegments: number
  percent: number
  message: string
  durationSeconds?: number
  outputSizeBytes?: number
}

export interface TtsJobActionResponse {
  success: boolean
  message: string
  canceled?: boolean
  filePath?: string
}
