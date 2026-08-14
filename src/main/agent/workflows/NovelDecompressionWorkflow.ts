import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { StorySourceSegment } from '../../../shared/agent/editingPlan'
import type {
  AgentModelMode,
  AgentWorkflowProgress,
  NovelDecompressionRequest,
  NovelDecompressionResult,
  PlanArtifact
} from '../../../shared/agent/workflow'
import { StoryAgent } from '../agents/StoryAgent'
import { EditPlannerAgent } from '../agents/EditPlannerAgent'
import { ReviewAgent } from '../agents/ReviewAgent'
import { buildEditingPlan } from '../planning/buildEditingPlan'
import { EditorTool } from '../tools/EditorTool'
import { ExportTool } from '../tools/ExportTool'
import { MediaTool } from '../tools/MediaTool'
import { SubtitleTool } from '../tools/SubtitleTool'
import { TtsTool } from '../tools/TtsTool'
import { resolveBundledMediaTool } from '../tools/mediaBinaryPaths'

export interface NovelWorkflowDependencies {
  storyAgent: StoryAgent
  editPlannerAgent: EditPlannerAgent
  reviewAgent: ReviewAgent
  ttsTool: TtsTool
  subtitleTool: SubtitleTool
  mediaTool: MediaTool
  editorTool: EditorTool
  exportTool: ExportTool
}

export interface NovelWorkflowRunContext {
  taskId: string
  signal: AbortSignal
  emit: (progress: Omit<AgentWorkflowProgress, 'taskId'>) => void
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('任务已取消')
}

function safeCopies(value?: number): number {
  const n = Number(value ?? 1)
  if (!Number.isFinite(n)) return 1
  return Math.min(20, Math.max(1, Math.round(n)))
}

function normalizeCanvas(
  value?: NovelDecompressionRequest['canvas']
): NonNullable<NovelDecompressionRequest['canvas']> {
  const canvas = value ?? { width: 1080, height: 1920, fps: 30 }
  const width = Number(canvas.width)
  const height = Number(canvas.height)
  const fps = Number(canvas.fps)
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(fps) ||
    width < 16 ||
    width > 7680 ||
    height < 16 ||
    height > 7680 ||
    fps < 1 ||
    fps > 120
  ) {
    throw new Error('Canvas width, height, and fps are outside the supported range')
  }
  return { width: Math.round(width), height: Math.round(height), fps: Math.round(fps) }
}

function normalizeTtsOptions(
  value: NovelDecompressionRequest['tts']
): NovelDecompressionRequest['tts'] {
  if (!value || typeof value !== 'object') throw new Error('TTS options are required')
  const language = String(value.language ?? '').trim()
  const modelId = String(value.modelId ?? '').trim()
  const voiceId = String(value.voiceId ?? '').trim()
  const speed = Number(value.speed)
  if (!language || !modelId || !voiceId)
    throw new Error('TTS language, modelId, and voiceId are required')
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2)
    throw new Error('TTS speed must be between 0.5 and 2')
  return { language, modelId, voiceId, speed }
}

function ensureNovelText(text: string): string {
  const clean = text.trim()
  if (clean.length < 20) throw new Error('小说正文太短，至少需要 20 个字符')
  if (clean.length > 100_000) throw new Error('小说正文超过 100000 字符，请拆分任务')
  return clean
}

export class NovelDecompressionWorkflow {
  constructor(private readonly deps: NovelWorkflowDependencies) {}

  async run(
    request: NovelDecompressionRequest,
    context: NovelWorkflowRunContext
  ): Promise<NovelDecompressionResult> {
    if (!request || typeof request !== 'object')
      throw new Error('Workflow request must be an object')
    const novelText = ensureNovelText(request.novelText)
    if (typeof request.mediaDirectory !== 'string' || !request.mediaDirectory.trim()) {
      throw new Error('Media directory is required')
    }
    const tts = normalizeTtsOptions(request.tts)
    const modelMode: AgentModelMode = request.modelMode ?? 'required'
    const copies = safeCopies(request.copies)
    const canvas = normalizeCanvas(request.canvas)
    const taskRoot = request.outputDirectory?.trim()
      ? join(request.outputDirectory, `agent-${context.taskId}`)
      : join(app.getPath('documents'), 'desktop-client-agent-output', `agent-${context.taskId}`)
    await mkdir(taskRoot, { recursive: true })

    context.emit({ stage: 'segmenting', percent: 3, message: '正在按现有 TTS 规则切分小说正文' })
    const sourceSegments: StorySourceSegment[] = this.deps.ttsTool.segmentText(
      novelText,
      tts.language
    )
    if (sourceSegments.length === 0) throw new Error('小说正文切分后没有有效内容')
    assertNotAborted(context.signal)

    context.emit({
      stage: 'story-analysis',
      percent: 8,
      message: `StoryAgent 正在分析 ${sourceSegments.length} 个段落的结构与节奏`
    })
    const story = await this.deps.storyAgent.analyze(sourceSegments, modelMode, context.signal)
    assertNotAborted(context.signal)

    let voice: import('../../../shared/agent/editingPlan').TtsWorkflowOutput
    try {
      voice = await this.deps.ttsTool.synthesize(
        context.taskId,
        sourceSegments,
        tts,
        ({ current, total, message }) => {
          const ratio = total > 0 ? current / total : 0
          context.emit({ stage: 'tts', percent: 12 + Math.round(ratio * 34), message })
        },
        context.signal
      )
      assertNotAborted(context.signal)
      const stableVoicePath = join(taskRoot, 'voice.wav')
      await copyFile(voice.audioPath, stableVoicePath)
      voice.audioPath = stableVoicePath
      if (typeof this.deps.ttsTool.cleanup === 'function') {
        await this.deps.ttsTool.cleanup(context.taskId)
      }
    } catch (error) {
      if (typeof this.deps.ttsTool.cleanup === 'function') {
        await this.deps.ttsTool.cleanup(context.taskId)
      }
      throw error
    }

    context.emit({
      stage: 'subtitles',
      percent: 48,
      message: '正在根据 TTS 真实时长生成字幕时间轴'
    })
    const subtitles = this.deps.subtitleTool.build(voice)
    const subtitlePath = join(taskRoot, 'voice.srt')
    await this.deps.subtitleTool.writeSrt(subtitlePath, subtitles)

    const requireProbe = Boolean(request.export?.enabled)
    const ffprobePath = request.ffprobePath?.trim() || resolveBundledMediaTool('ffprobe')
    const assets = await this.deps.mediaTool.scan(
      request.mediaDirectory,
      ffprobePath,
      requireProbe,
      (current, total, message) => {
        const ratio = total > 0 ? current / total : 0
        context.emit({ stage: 'media-scan', percent: 50 + Math.round(ratio * 12), message })
      },
      context.signal
    )
    assertNotAborted(context.signal)

    context.emit({
      stage: 'edit-planning',
      percent: 64,
      message: 'EditPlannerAgent 正在生成解压类剪辑策略'
    })
    const strategy = await this.deps.editPlannerAgent.createStrategy(
      story,
      modelMode,
      context.signal
    )
    const title = request.title?.trim() || '小说推文-解压模式'
    const plans = Array.from({ length: copies }, (_, copyIndex) =>
      buildEditingPlan({
        taskId: context.taskId,
        copyIndex,
        title: `${title}-${String(copyIndex + 1).padStart(2, '0')}`,
        story,
        voice,
        subtitles,
        assets,
        strategy,
        canvas,
        appName: request.appName,
        appIconPath: request.appIconPath,
        callToAction: request.callToAction
      })
    )

    const staged: Array<{ planPath: string; commandPath: string }> = []
    for (let index = 0; index < plans.length; index += 1) {
      assertNotAborted(context.signal)
      context.emit({
        stage: 'editor-staging',
        percent: 68 + Math.round((index / plans.length) * 7),
        message: `正在生成第 ${index + 1}/${plans.length} 份 EditingPlan 和 Editor Commands`
      })
      const stageDirectory = join(taskRoot, `copy-${String(index + 1).padStart(2, '0')}`)
      staged.push(await this.deps.editorTool.stage(plans[index], stageDirectory))
    }

    const artifacts: PlanArtifact[] = []
    for (let index = 0; index < plans.length; index += 1) {
      assertNotAborted(context.signal)
      context.emit({
        stage: 'review',
        percent: 76 + Math.round((index / plans.length) * 8),
        message: `ReviewAgent 正在质检第 ${index + 1}/${plans.length} 份计划`
      })
      const review = await this.deps.reviewAgent.review(
        plans[index],
        story,
        modelMode,
        index === 0,
        context.signal
      )
      artifacts.push({
        plan: plans[index],
        planPath: staged[index].planPath,
        commandPath: staged[index].commandPath,
        review
      })
    }

    if (request.export?.enabled) {
      const ffmpegPath = request.export.ffmpegPath?.trim() || resolveBundledMediaTool('ffmpeg')
      for (let index = 0; index < artifacts.length; index += 1) {
        assertNotAborted(context.signal)
        const artifact = artifacts[index]
        const outputPath = join(
          taskRoot,
          `copy-${String(index + 1).padStart(2, '0')}`,
          'output.mp4'
        )
        artifact.exportedVideoPath = await this.deps.exportTool.export(
          artifact.plan,
          outputPath,
          subtitlePath,
          ffmpegPath,
          request.export.burnSubtitles ?? true,
          (current, total, message) => {
            const copyBase = index / artifacts.length
            const copyProgress = total > 0 ? current / total / artifacts.length : 0
            context.emit({
              stage: 'export',
              percent: 85 + Math.round((copyBase + copyProgress) * 14),
              message: `第 ${index + 1}/${artifacts.length} 份：${message}`
            })
          },
          context.signal
        )
      }
    }

    assertNotAborted(context.signal)

    return {
      taskId: context.taskId,
      story,
      voicePath: voice.audioPath,
      subtitlePath,
      durationSeconds: voice.durationSeconds,
      assetsScanned: assets.length,
      artifacts
    }
  }
}
