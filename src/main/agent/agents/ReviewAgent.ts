import type {
  EditingPlan,
  ReviewIssue,
  ReviewResult,
  StoryAnalysis
} from '../../../shared/agent/editingPlan'
import type { AgentModelMode } from '../../../shared/agent/workflow'
import { AgentRuntime } from '../runtime/AgentRuntime'

interface ModelReviewOutput {
  score?: number
  comment?: string
}

function deterministicReview(plan: EditingPlan): ReviewIssue[] {
  const issues: ReviewIssue[] = []
  const clips = [...plan.videoClips].sort((a, b) => a.timelineStartSeconds - b.timelineStartSeconds)

  if (clips.length === 0) {
    issues.push({ code: 'NO_VIDEO', severity: 'error', message: '时间线没有视频片段', autoFixable: false })
    return issues
  }

  let cursor = 0
  let lastAssetId = ''
  let consecutive = 0

  for (const clip of clips) {
    if (clip.timelineStartSeconds - cursor > 0.08) {
      issues.push({
        code: 'VIDEO_GAP',
        severity: 'error',
        message: `${cursor.toFixed(2)}s 到 ${clip.timelineStartSeconds.toFixed(2)}s 存在画面空档`,
        autoFixable: true
      })
    }
    if (clip.assetId === lastAssetId) consecutive += 1
    else consecutive = 1
    if (consecutive >= 3) {
      issues.push({
        code: 'ASSET_REPEAT',
        severity: 'warning',
        message: `素材 ${clip.assetId} 连续出现 ${consecutive} 次`,
        autoFixable: true
      })
    }
    lastAssetId = clip.assetId
    cursor = Math.max(cursor, clip.timelineStartSeconds + clip.durationSeconds)
  }

  if (Math.abs(cursor - plan.durationSeconds) > 0.12) {
    issues.push({
      code: 'DURATION_MISMATCH',
      severity: 'error',
      message: `视频轨结束 ${cursor.toFixed(2)}s，与配音 ${plan.durationSeconds.toFixed(2)}s 不一致`,
      autoFixable: true
    })
  }

  const subtitleEnd = plan.subtitles.at(-1)?.endSeconds ?? 0
  if (plan.subtitles.length === 0) {
    issues.push({ code: 'NO_SUBTITLE', severity: 'warning', message: '没有生成字幕', autoFixable: false })
  } else if (subtitleEnd > plan.durationSeconds + 0.15) {
    issues.push({
      code: 'SUBTITLE_OVERFLOW',
      severity: 'warning',
      message: '最后一条字幕超出配音时长',
      autoFixable: true
    })
  }

  return issues
}

export class ReviewAgent {
  constructor(private readonly runtime: AgentRuntime) {}

  async review(
    plan: EditingPlan,
    story: StoryAnalysis,
    mode: AgentModelMode,
    useModelReview: boolean,
    signal?: AbortSignal
  ): Promise<ReviewResult> {
    const issues = deterministicReview(plan)
    const hardErrors = issues.filter((item) => item.severity === 'error').length
    const warnings = issues.filter((item) => item.severity === 'warning').length
    let score = Math.max(0, 100 - hardErrors * 30 - warnings * 8)
    let modelComment: string | undefined

    if (useModelReview) {
      const modelResult = await this.runtime.runWithFallback(
        mode,
        async () => {
          return this.runtime.model.completeJson<ModelReviewOutput>({
            signal,
            system:
              '你是 ReviewAgent，只审核解压类小说推文的剪辑计划节奏。不要要求画面与剧情逐句匹配。必须返回 JSON。',
            user: JSON.stringify({
              task: '给剪辑计划打 0-100 分并用一句话指出最大节奏问题。',
              story: {
                summary: story.summary,
                tone: story.tone,
                paces: story.segments.map((item) => ({ id: item.id, pace: item.pace, role: item.role }))
              },
              plan: {
                durationSeconds: plan.durationSeconds,
                clipCount: plan.videoClips.length,
                averageClipSeconds:
                  plan.videoClips.reduce((sum, item) => sum + item.durationSeconds, 0) / Math.max(1, plan.videoClips.length)
              },
              deterministicIssues: issues
            })
          })
        },
        () => ({ score, comment: '规则质检通过，未启用额外模型复核。' })
      )

      if (Number.isFinite(modelResult.score)) score = Math.round(Math.min(100, Math.max(0, Number(modelResult.score))))
      modelComment = modelResult.comment?.trim() || undefined
    }

    return {
      passed: hardErrors === 0,
      score,
      issues,
      modelComment
    }
  }
}
