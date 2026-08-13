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

export interface AgentCatalogModel {
  id: string
  name: string
  description?: string
}

export interface AgentModelProvider {
  id: string
  name: string
  recommendedModelId: string
  models: AgentCatalogModel[]
}

export interface AgentModelCatalog {
  providers: AgentModelProvider[]
}

export interface AgentModelCatalogResponse extends AgentActionResponse {
  catalog: AgentModelCatalog | null
  source: 'remote' | 'fallback' | 'unavailable'
}

export interface AgentModelRegistryItem {
  id: string
  kind: 'provider' | 'custom'
  modelId: string
  providerId?: string
  providerName?: string
  modelName?: string
  baseUrl?: string
}

export interface AgentModelRegistryResponse extends AgentActionResponse {
  configurations: AgentModelRegistryItem[]
}

export interface ProviderAgentModelCreateRequest {
  kind: 'provider'
  providerId: string
  modelId: string
  apiKey: string
}

export interface CustomAgentModelCreateRequest {
  kind: 'custom'
  baseUrl: string
  modelId: string
  apiKey: string
}

export type AgentModelCreateRequest =
  ProviderAgentModelCreateRequest | CustomAgentModelCreateRequest

export interface ProviderAgentModelUpdateRequest {
  id: string
  kind: 'provider'
  providerId: string
  modelId: string
  apiKey?: string
}

export interface CustomAgentModelUpdateRequest {
  id: string
  kind: 'custom'
  baseUrl: string
  modelId: string
  apiKey?: string
}

export type AgentModelUpdateRequest =
  ProviderAgentModelUpdateRequest | CustomAgentModelUpdateRequest

export interface AgentModelMutationResponse extends AgentActionResponse {
  configuration?: AgentModelRegistryItem
}

export type AgentChatMode = 'agent' | 'assistant'

export type AgentApprovalMode = 'request' | 'smart' | 'full'

export type AgentEditorPlanAction =
  | { type: 'clip.delete'; clipIds: string[]; magnetMainTrack?: boolean }
  | { type: 'clip.split'; clipId: string; at: number }
  | { type: 'clip.move'; clipId: string; timelineStart: number; trackId?: string }
  | {
      type: 'clip.update'
      clipId: string
      patch: {
        opacity?: number
        volume?: number
        muted?: boolean
        speed?: number
        enabled?: boolean
        transform?: {
          x?: number
          y?: number
          scaleX?: number
          scaleY?: number
          rotation?: number
        }
      }
    }

export interface AgentEditorPlan {
  planId: string
  projectRevision: number
  summary: string
  actions: AgentEditorPlanAction[]
}

export type AgentToolResultCode =
  | 'OK'
  | 'AWAITING_APPROVAL'
  | 'REJECTED'
  | 'STALE_CONTEXT'
  | 'INVALID_PLAN'
  | 'UNSUPPORTED_ACTION'
  | 'EDITOR_UNAVAILABLE'
  | 'EXECUTION_FAILED'

export interface AgentToolExecutionResult {
  success: boolean
  code: AgentToolResultCode
  message: string
  changed: boolean
  affectedClipIds: string[]
  data?: unknown
}

export type AgentToolCall =
  | { id: string; name: 'get_editor_context'; arguments: Record<string, never> }
  | { id: string; name: 'propose_editor_plan'; arguments: AgentEditorPlan }

export type AgentChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: AgentToolCall[] }
  | { role: 'tool'; content: string; toolCallId: string; name: AgentToolCall['name'] }

export interface AgentChatRequest {
  configId: string
  mode: AgentChatMode
  approvalMode: AgentApprovalMode
  messages: AgentChatMessage[]
}

export interface AgentChatAssistantMessage {
  content: string
  toolCalls: AgentToolCall[]
}

export interface AgentChatResponse extends AgentActionResponse {
  assistant?: AgentChatAssistantMessage
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
