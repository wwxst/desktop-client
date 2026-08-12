import { ipcMain, net } from 'electron'
import type {
  AgentChatMessage,
  AgentChatRequest,
  AgentChatResponse,
  AgentToolCall,
  AgentModelCatalogResponse,
  AgentModelCreateRequest,
  AgentModelMutationResponse,
  AgentModelRegistryResponse,
  AgentModelUpdateRequest,
  NovelDecompressionRequest
} from '../../shared/agent/workflow'
import { StoryAgent } from './agents/StoryAgent'
import { EditPlannerAgent } from './agents/EditPlannerAgent'
import { ReviewAgent } from './agents/ReviewAgent'
import {
  FALLBACK_MODEL_CATALOG,
  findInternalModelProvider,
  parseInternalModelProviders,
  toPublicProvider,
  type InternalAgentModelProvider
} from './modelCatalog'
import { AgentRuntime } from './runtime/AgentRuntime'
import { ModelGateway } from './runtime/ModelGateway'
import { ModelRegistry } from './runtime/ModelRegistry'
import { WorkflowRunner } from './runtime/WorkflowRunner'
import { EditorTool } from './tools/EditorTool'
import { ExportTool } from './tools/ExportTool'
import { MediaTool } from './tools/MediaTool'
import { SubtitleTool } from './tools/SubtitleTool'
import { TtsTool } from './tools/TtsTool'
import { NovelDecompressionWorkflow } from './workflows/NovelDecompressionWorkflow'

const MODEL_CATALOG_URL = 'http://localhost:8080/api/ai/model-catalog'

export interface AgentModelServices {
  registry: ModelRegistry
  gateway: ModelGateway
  runner: WorkflowRunner
  setRemoteProviders: (providers: InternalAgentModelProvider[]) => void
}

interface RegisterAgentIpcOptions {
  services?: AgentModelServices
  loadRemoteCatalog?: () => Promise<unknown>
}

export function createAgentModelServices(): AgentModelServices {
  let remoteProviders: InternalAgentModelProvider[] = []
  const resolveProvider = (providerId: string): InternalAgentModelProvider | undefined =>
    remoteProviders.find((provider) => provider.id === providerId) ??
    findInternalModelProvider(providerId)
  const registry = new ModelRegistry(resolveProvider)
  const gateway = new ModelGateway(registry)
  const runtime = new AgentRuntime(gateway)
  const workflow = new NovelDecompressionWorkflow({
    storyAgent: new StoryAgent(runtime),
    editPlannerAgent: new EditPlannerAgent(runtime),
    reviewAgent: new ReviewAgent(runtime),
    ttsTool: new TtsTool(),
    subtitleTool: new SubtitleTool(),
    mediaTool: new MediaTool(),
    editorTool: new EditorTool(),
    exportTool: new ExportTool()
  })

  return {
    registry,
    gateway,
    runner: new WorkflowRunner(workflow),
    setRemoteProviders: (providers) => {
      remoteProviders = providers.map((provider) => ({
        ...provider,
        models: provider.models.map((model) => ({ ...model }))
      }))
    }
  }
}

const defaultServices = createAgentModelServices()

async function loadRemoteCatalog(): Promise<unknown> {
  const response = await net.fetch(MODEL_CATALOG_URL, {
    method: 'GET',
    signal: AbortSignal.timeout(5_000)
  })
  if (!response.ok) throw new Error(`模型目录请求失败：HTTP ${response.status}`)
  return response.json()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isChatMessage(value: unknown): value is AgentChatMessage {
  if (!isRecord(value) || typeof value.content !== 'string' || value.content.length > 20_000) {
    return false
  }
  if (value.role === 'user')
    return Object.keys(value).every((key) => ['role', 'content'].includes(key))
  if (value.role === 'assistant') {
    return (
      Object.keys(value).every((key) => ['role', 'content', 'toolCalls'].includes(key)) &&
      (value.toolCalls === undefined ||
        (Array.isArray(value.toolCalls) &&
          value.toolCalls.length <= 12 &&
          value.toolCalls.every(
            (call) =>
              isRecord(call) &&
              Object.keys(call).every((key) => ['id', 'name', 'arguments'].includes(key)) &&
              typeof call.id === 'string' &&
              call.id.trim().length > 0 &&
              call.id.length <= 200 &&
              isToolName(call.name) &&
              isToolArguments(call.name, call.arguments)
          )))
    )
  }
  return (
    value.role === 'tool' &&
    typeof value.toolCallId === 'string' &&
    value.toolCallId.trim().length > 0 &&
    value.toolCallId.length <= 200 &&
    isToolName(value.name) &&
    Object.keys(value).every((key) => ['role', 'content', 'toolCallId', 'name'].includes(key))
  )
}

function isToolName(value: unknown): value is AgentToolCall['name'] {
  return (
    value === 'get_editor_context' ||
    value === 'delete_selected_clips' ||
    value === 'split_selected_clip'
  )
}

function isToolArguments(name: AgentToolCall['name'], value: unknown): boolean {
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  if (name === 'delete_selected_clips') {
    return (
      keys.every((key) => key === 'magnetMainTrack') &&
      (value.magnetMainTrack === undefined || typeof value.magnetMainTrack === 'boolean')
    )
  }
  return keys.length === 0
}

function isChatRequest(value: unknown): value is AgentChatRequest {
  return (
    isRecord(value) &&
    typeof value.configId === 'string' &&
    value.configId.trim().length > 0 &&
    value.configId.length <= 200 &&
    Array.isArray(value.messages) &&
    value.messages.length > 0 &&
    value.messages.length <= 60 &&
    value.messages.every(isChatMessage)
  )
}

function isWorkflowRequest(value: unknown): value is NovelDecompressionRequest {
  if (!isRecord(value) || !isRecord(value.tts)) return false
  const tts = value.tts
  return (
    typeof value.novelText === 'string' &&
    value.novelText.trim().length > 0 &&
    typeof value.mediaDirectory === 'string' &&
    value.mediaDirectory.trim().length > 0 &&
    typeof tts.language === 'string' &&
    typeof tts.modelId === 'string' &&
    typeof tts.voiceId === 'string' &&
    Number.isFinite(Number(tts.speed))
  )
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function registerAgentIpc(options: RegisterAgentIpcOptions = {}): void {
  const services = options.services ?? defaultServices
  const requestRemoteCatalog = options.loadRemoteCatalog ?? loadRemoteCatalog
  const channels = [
    'agent:model-catalog:list',
    'agent:model-config:list',
    'agent:model-config:create',
    'agent:model-config:update',
    'agent:model-config:delete',
    'agent:chat:run',
    'agent:workflow:novel-decompression:start',
    'agent:workflow:get',
    'agent:workflow:cancel'
  ]
  for (const channel of channels) ipcMain.removeHandler(channel)

  ipcMain.handle('agent:model-catalog:list', async (): Promise<AgentModelCatalogResponse> => {
    try {
      const providers = parseInternalModelProviders(await requestRemoteCatalog())
      if (providers) {
        services.setRemoteProviders(providers)
        return {
          success: true,
          message: '模型目录加载成功',
          source: 'remote',
          catalog: { providers: providers.map(toPublicProvider) }
        }
      }
    } catch (error) {
      console.warn('加载远程模型目录失败，使用内置目录：', error)
    }

    services.setRemoteProviders([])
    return {
      success: true,
      message: '远程目录不可用，当前使用内置模型目录',
      source: 'fallback',
      catalog: FALLBACK_MODEL_CATALOG
    }
  })

  ipcMain.handle('agent:model-config:list', async (): Promise<AgentModelRegistryResponse> => ({
    success: true,
    message: '模型配置加载成功',
    configurations: services.registry.list()
  }))

  ipcMain.handle(
    'agent:model-config:create',
    async (_event, request: AgentModelCreateRequest): Promise<AgentModelMutationResponse> => {
      try {
        return {
          success: true,
          message: '模型配置添加成功',
          configuration: services.registry.create(request)
        }
      } catch (error) {
        return { success: false, message: errorMessage(error, '模型配置添加失败') }
      }
    }
  )

  ipcMain.handle(
    'agent:chat:run',
    async (_event, request: AgentChatRequest): Promise<AgentChatResponse> => {
      if (!isChatRequest(request)) return { success: false, message: '无效的 AI 对话请求' }
      try {
        return {
          success: true,
          message: '对话完成',
          assistant: await services.gateway.chat(request.configId, request.messages)
        }
      } catch (error) {
        return { success: false, message: errorMessage(error, 'AI 对话失败') }
      }
    }
  )

  ipcMain.handle(
    'agent:model-config:update',
    async (_event, request: AgentModelUpdateRequest): Promise<AgentModelMutationResponse> => {
      try {
        return {
          success: true,
          message: '模型配置更新成功',
          configuration: services.registry.update(request)
        }
      } catch (error) {
        return { success: false, message: errorMessage(error, '模型配置更新失败') }
      }
    }
  )

  ipcMain.handle(
    'agent:model-config:delete',
    async (_event, configId: string): Promise<AgentModelMutationResponse> =>
      services.registry.delete(configId)
        ? { success: true, message: '模型配置已删除' }
        : { success: false, message: '模型配置不存在' }
  )

  ipcMain.handle(
    'agent:workflow:novel-decompression:start',
    async (event, request: NovelDecompressionRequest) => {
      if (!isWorkflowRequest(request)) {
        return { success: false, message: 'Invalid Agent workflow request' }
      }
      return services.runner.startNovelDecompression(request, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('agent:workflow:progress', progress)
      })
    }
  )

  ipcMain.handle('agent:workflow:get', async (_event, taskId: string) =>
    typeof taskId === 'string' && taskId.trim() ? services.runner.getTask(taskId.trim()) : null
  )
  ipcMain.handle('agent:workflow:cancel', async (_event, taskId: string) =>
    typeof taskId === 'string' && taskId.trim()
      ? services.runner.cancel(taskId.trim())
      : { success: false, message: 'Invalid Agent task id' }
  )
}
