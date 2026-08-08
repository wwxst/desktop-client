import { ipcMain } from 'electron'
import type { AgentModelConfig, NovelDecompressionRequest } from '../../shared/agent/workflow'
import { StoryAgent } from './agents/StoryAgent'
import { EditPlannerAgent } from './agents/EditPlannerAgent'
import { ReviewAgent } from './agents/ReviewAgent'
import { AgentRuntime } from './runtime/AgentRuntime'
import { ModelGateway } from './runtime/ModelGateway'
import { WorkflowRunner } from './runtime/WorkflowRunner'
import { EditorTool } from './tools/EditorTool'
import { ExportTool } from './tools/ExportTool'
import { MediaTool } from './tools/MediaTool'
import { SubtitleTool } from './tools/SubtitleTool'
import { TtsTool } from './tools/TtsTool'
import { NovelDecompressionWorkflow } from './workflows/NovelDecompressionWorkflow'

const modelGateway = new ModelGateway()
const runtime = new AgentRuntime(modelGateway)
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
const runner = new WorkflowRunner(workflow)

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
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

export function registerAgentIpc(): void {
  const channels = [
    'agent:model:configure',
    'agent:model:status',
    'agent:workflow:novel-decompression:start',
    'agent:workflow:get',
    'agent:workflow:cancel'
  ]
  for (const channel of channels) ipcMain.removeHandler(channel)

  ipcMain.handle('agent:model:configure', async (_event, config: AgentModelConfig) => {
    try {
      modelGateway.configure(config)
      return { success: true, message: '大模型配置已加载到主进程内存' }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '大模型配置失败' }
    }
  })

  ipcMain.handle('agent:model:status', async () => modelGateway.getStatus())

  ipcMain.handle(
    'agent:workflow:novel-decompression:start',
    async (event, request: NovelDecompressionRequest) => {
      if (!isWorkflowRequest(request)) {
        return { success: false, message: 'Invalid Agent workflow request' }
      }
      return runner.startNovelDecompression(request, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('agent:workflow:progress', progress)
      })
    }
  )

  ipcMain.handle('agent:workflow:get', async (_event, taskId: string) => {
    return typeof taskId === 'string' && taskId.trim() ? runner.getTask(taskId.trim()) : null
  })
  ipcMain.handle('agent:workflow:cancel', async (_event, taskId: string) => {
    return typeof taskId === 'string' && taskId.trim()
      ? runner.cancel(taskId.trim())
      : { success: false, message: 'Invalid Agent task id' }
  })
}
