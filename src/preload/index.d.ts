import type { ElectronAPI } from '@electron-toolkit/preload'
import type {
  LoginRequest,
  LoginResponse,
  SubscriptionCheckResponse
} from '../shared/auth'
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

interface DesktopApi {
  login(loginRequest: LoginRequest): Promise<LoginResponse>
  getSubscription(): Promise<SubscriptionCheckResponse>

  listTtsCatalog(): Promise<TtsCatalogResponse>
  installTtsModel(modelId: string): Promise<TtsModelActionResponse>
  removeTtsModel(modelId: string): Promise<TtsModelActionResponse>
  openTtsModelDirectory(): Promise<TtsModelActionResponse>

  previewTts(request: TtsGenerateRequest): Promise<TtsPreviewResponse>
  createTtsJob(request: TtsGenerateRequest): Promise<TtsCreateJobResponse>
  cancelTtsJob(jobId: string): Promise<TtsJobActionResponse>
  saveTtsJob(jobId: string): Promise<TtsJobActionResponse>

  onTtsModelDownloadProgress(
    callback: (progress: TtsModelDownloadProgress) => void
  ): () => void
  onTtsJobProgress(callback: (progress: TtsJobProgress) => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: DesktopApi
  }
}
