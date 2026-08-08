import type { EditingPlan, ReviewResult, StoryAnalysis } from './editingPlan'

export interface AgentModelConfig {
  baseUrl: string
  apiKey: string
  model: string
  temperature?: number
  timeoutMs?: number
}

export interface AgentModelStatus {
  configured: boolean
  baseUrl?: string
  model?: string
}

export type AgentModelMode = 'required' | 'prefer' | 'disabled'

export interface NovelTtsOptions {
  language: string
  modelId: string
  voiceId: string
  speed: number
}

export interface NovelDecompressionRequest {
  novelText: string
  mediaDirectory: string
  outputDirectory?: string
  copies?: number
  title?: string
  appName?: string
  appIconPath?: string
  callToAction?: string
  tts: NovelTtsOptions
  modelMode?: AgentModelMode
  canvas?: {
    width: number
    height: number
    fps: number
  }
  ffprobePath?: string
  export?: {
    enabled: boolean
    ffmpegPath?: string
    burnSubtitles?: boolean
  }
}

export type AgentWorkflowStage =
  | 'queued'
  | 'segmenting'
  | 'story-analysis'
  | 'tts'
  | 'subtitles'
  | 'media-scan'
  | 'edit-planning'
  | 'editor-staging'
  | 'review'
  | 'export'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface AgentWorkflowProgress {
  taskId: string
  stage: AgentWorkflowStage
  percent: number
  message: string
}

export interface PlanArtifact {
  plan: EditingPlan
  planPath: string
  commandPath: string
  review: ReviewResult
  exportedVideoPath?: string
}

export interface NovelDecompressionResult {
  taskId: string
  story: StoryAnalysis
  voicePath: string
  subtitlePath: string
  durationSeconds: number
  assetsScanned: number
  artifacts: PlanArtifact[]
}

export interface WorkflowTaskSnapshot {
  taskId: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  stage: AgentWorkflowStage
  percent: number
  message: string
  createdAt: number
  updatedAt: number
  result?: NovelDecompressionResult
  error?: string
}

export interface AgentActionResponse {
  success: boolean
  message: string
}

export interface StartAgentWorkflowResponse extends AgentActionResponse {
  taskId?: string
}
