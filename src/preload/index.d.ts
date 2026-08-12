import type { ElectronAPI } from '@electron-toolkit/preload'
import type { LoginRequest, LoginResponse, SubscriptionCheckResponse } from '../shared/auth'
import type {
  TtsCatalogResponse,
  TtsCreateJobResponse,
  TtsGenerateRequest,
  TtsJobActionResponse,
  TtsJobProgress,
  TtsModelActionResponse,
  TtsModelDownloadProgress,
  TtsPreviewResponse
} from '../shared/tts'
import type {
  AgentActionResponse,
  AgentModelCatalogResponse,
  AgentModelCreateRequest,
  AgentModelMutationResponse,
  AgentModelRegistryResponse,
  AgentModelUpdateRequest,
  AgentWorkflowProgress,
  NovelDecompressionRequest,
  StartAgentWorkflowResponse,
  WorkflowTaskSnapshot
} from '../shared/agent/workflow'
import type {
  GlobalMediaImportResponse,
  GlobalMediaLibraryResponse,
  GlobalMediaRelocationResponse
} from '../shared/mediaLibrary'

interface DesktopApi {
  login(loginRequest: LoginRequest): Promise<LoginResponse>
  getSubscription(): Promise<SubscriptionCheckResponse>

  listGlobalMediaLibrary(): Promise<GlobalMediaLibraryResponse>
  importGlobalMediaFiles(): Promise<GlobalMediaImportResponse>
  addGlobalMediaTag(assetId: string, tag: string): Promise<GlobalMediaLibraryResponse>
  removeGlobalMediaTag(assetId: string, tag: string): Promise<GlobalMediaLibraryResponse>
  relocateGlobalMediaAsset(assetId: string): Promise<GlobalMediaRelocationResponse>

  listTtsCatalog(): Promise<TtsCatalogResponse>
  installTtsModel(modelId: string): Promise<TtsModelActionResponse>
  removeTtsModel(modelId: string): Promise<TtsModelActionResponse>
  openTtsModelDirectory(): Promise<TtsModelActionResponse>

  previewTts(request: TtsGenerateRequest): Promise<TtsPreviewResponse>
  createTtsJob(request: TtsGenerateRequest): Promise<TtsCreateJobResponse>
  cancelTtsJob(jobId: string): Promise<TtsJobActionResponse>
  saveTtsJob(jobId: string): Promise<TtsJobActionResponse>

  listAgentModelCatalog(): Promise<AgentModelCatalogResponse>
  listAgentModelConfigurations(): Promise<AgentModelRegistryResponse>
  createAgentModelConfiguration(
    request: AgentModelCreateRequest
  ): Promise<AgentModelMutationResponse>
  updateAgentModelConfiguration(
    request: AgentModelUpdateRequest
  ): Promise<AgentModelMutationResponse>
  deleteAgentModelConfiguration(configId: string): Promise<AgentModelMutationResponse>
  runNovelDecompression(request: NovelDecompressionRequest): Promise<StartAgentWorkflowResponse>
  getAgentTask(taskId: string): Promise<WorkflowTaskSnapshot | null>
  cancelAgentTask(taskId: string): Promise<AgentActionResponse>
  onAgentWorkflowProgress(callback: (progress: AgentWorkflowProgress) => void): () => void
  onTtsModelDownloadProgress(callback: (progress: TtsModelDownloadProgress) => void): () => void
  onTtsJobProgress(callback: (progress: TtsJobProgress) => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: DesktopApi
  }
}
