import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
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
import type {
  AgentActionResponse,
  AgentModelConfig,
  AgentModelStatus,
  AgentWorkflowProgress,
  NovelDecompressionRequest,
  StartAgentWorkflowResponse,
  WorkflowTaskSnapshot
} from '../shared/agent/workflow'

/**
 * 只向 React 页面开放允许使用的功能。
 *
 * 不直接暴露完整的 ipcRenderer，避免 React 页面随意调用主进程能力。
 */
const api = {
  /** 用户登录。 */
  login: (loginRequest: LoginRequest): Promise<LoginResponse> => {
    return ipcRenderer.invoke('auth:login', loginRequest)
  },

  /** 查询当前登录用户的订阅状态。 */
  getSubscription: (): Promise<SubscriptionCheckResponse> => {
    return ipcRenderer.invoke('subscription:get-current')
  },

  /** 获取本地 TTS 语言、模型、安装状态和音色。 */
  listTtsCatalog: (): Promise<TtsCatalogResponse> => {
    return ipcRenderer.invoke('tts:catalog:list')
  },

  /** 下载并安装一个本地语音模型。 */
  installTtsModel: (modelId: string): Promise<TtsModelActionResponse> => {
    return ipcRenderer.invoke('tts:model:install', modelId)
  },

  /** 删除一个本地语音模型。 */
  removeTtsModel: (modelId: string): Promise<TtsModelActionResponse> => {
    return ipcRenderer.invoke('tts:model:remove', modelId)
  },

  /** 打开用户电脑上的模型目录。 */
  openTtsModelDirectory: (): Promise<TtsModelActionResponse> => {
    return ipcRenderer.invoke('tts:model:open-directory')
  },

  /** 生成短文本试听。 */
  previewTts: (request: TtsGenerateRequest): Promise<TtsPreviewResponse> => {
    return ipcRenderer.invoke('tts:preview', request)
  },

  /** 创建长文本配音任务。 */
  createTtsJob: (request: TtsGenerateRequest): Promise<TtsCreateJobResponse> => {
    return ipcRenderer.invoke('tts:job:create', request)
  },

  /** 取消长文本配音任务。 */
  cancelTtsJob: (jobId: string): Promise<TtsJobActionResponse> => {
    return ipcRenderer.invoke('tts:job:cancel', jobId)
  },

  /** 保存已经生成完成的 WAV 音频。 */
  saveTtsJob: (jobId: string): Promise<TtsJobActionResponse> => {
    return ipcRenderer.invoke('tts:job:save', jobId)
  },

  /** 将大模型配置加载到 Electron 主进程内存。 */
  configureAgentModel: (config: AgentModelConfig): Promise<AgentActionResponse> => {
    return ipcRenderer.invoke('agent:model:configure', config)
  },
  /** 查询 Agent 当前使用的大模型，不返回 API Key。 */
  getAgentModelStatus: (): Promise<AgentModelStatus> => {
    return ipcRenderer.invoke('agent:model:status')
  },
  /** 启动“解压类小说推文”多 Agent 工作流。 */
  runNovelDecompression: (request: NovelDecompressionRequest): Promise<StartAgentWorkflowResponse> => {
    return ipcRenderer.invoke('agent:workflow:novel-decompression:start', request)
  },
  /** 查询 Agent 长任务状态和最终结果。 */
  getAgentTask: (taskId: string): Promise<WorkflowTaskSnapshot | null> => {
    return ipcRenderer.invoke('agent:workflow:get', taskId)
  },
  /** 取消一个 Agent 长任务。 */
  cancelAgentTask: (taskId: string): Promise<AgentActionResponse> => {
    return ipcRenderer.invoke('agent:workflow:cancel', taskId)
  },
  /** 监听 Agent 工作流进度。 */
  onAgentWorkflowProgress: (callback: (progress: AgentWorkflowProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: AgentWorkflowProgress): void => {
      callback(progress)
    }
    ipcRenderer.on('agent:workflow:progress', listener)
    return () => ipcRenderer.removeListener('agent:workflow:progress', listener)
  },
  /** 监听模型下载和解压进度。 */
  onTtsModelDownloadProgress: (
    callback: (progress: TtsModelDownloadProgress) => void
  ): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: TtsModelDownloadProgress): void => {
      callback(progress)
    }

    ipcRenderer.on('tts:model:progress', listener)
    return () => ipcRenderer.removeListener('tts:model:progress', listener)
  },

  /** 监听长文本配音任务进度。 */
  onTtsJobProgress: (callback: (progress: TtsJobProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: TtsJobProgress): void => {
      callback(progress)
    }

    ipcRenderer.on('tts:job:progress', listener)
    return () => ipcRenderer.removeListener('tts:job:progress', listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('注册 preload 接口失败：', error)
  }
} else {
  // @ts-ignore 仅用于关闭 contextIsolation 时兼容模板
  window.electron = electronAPI
  // @ts-ignore 仅用于关闭 contextIsolation 时兼容模板
  window.api = api
}
