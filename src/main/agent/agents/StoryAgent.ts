import type {
  StoryAnalysis,
  StoryPace,
  StoryRole,
  StorySourceSegment
} from '../../../shared/agent/editingPlan'
import type { AgentModelMode } from '../../../shared/agent/workflow'
import { AgentRuntime } from '../runtime/AgentRuntime'

interface StoryModelOutput {
  summary?: string
  tone?: string
  segments?: Array<{
    id?: string
    role?: StoryRole
    pace?: StoryPace
    importance?: number
    note?: string
  }>
}

const VALID_ROLES = new Set<StoryRole>(['hook', 'setup', 'conflict', 'turn', 'climax', 'ending'])
const VALID_PACES = new Set<StoryPace>(['slow', 'normal', 'fast', 'very-fast'])
const MAX_BATCH_CHARS = 12_000
const MAX_BATCH_SEGMENTS = 48

function fallbackStory(segments: StorySourceSegment[]): StoryAnalysis {
  const total = Math.max(segments.length, 1)
  return {
    summary: '未调用大模型，使用规则节奏分析。',
    tone: 'narrative',
    segments: segments.map((segment, index) => {
      const ratio = index / total
      let role: StoryRole = 'setup'
      let pace: StoryPace = 'normal'
      let importance = 0.55

      if (index === 0) {
        role = 'hook'
        pace = 'fast'
        importance = 0.9
      } else if (ratio > 0.82) {
        role = ratio > 0.94 ? 'ending' : 'climax'
        pace = ratio > 0.94 ? 'normal' : 'very-fast'
        importance = 0.85
      } else if (ratio > 0.58) {
        role = 'turn'
        pace = 'fast'
        importance = 0.75
      } else if (ratio > 0.28) {
        role = 'conflict'
        pace = 'normal'
        importance = 0.65
      }

      return { ...segment, role, pace, importance }
    })
  }
}

function normalizeModelOutput(
  source: StorySourceSegment[],
  output: StoryModelOutput
): StoryAnalysis {
  const byId = new Map(output.segments?.map((item) => [item.id, item]) ?? [])
  const fallback = fallbackStory(source)

  return {
    summary: output.summary?.trim() || fallback.summary,
    tone: output.tone?.trim() || fallback.tone,
    segments: source.map((segment, index) => {
      const modelItem = byId.get(segment.id)
      const fallbackItem = fallback.segments[index]
      const role =
        modelItem?.role && VALID_ROLES.has(modelItem.role) ? modelItem.role : fallbackItem.role
      const pace =
        modelItem?.pace && VALID_PACES.has(modelItem.pace) ? modelItem.pace : fallbackItem.pace
      const importance = Number.isFinite(modelItem?.importance)
        ? Math.min(1, Math.max(0, Number(modelItem?.importance)))
        : fallbackItem.importance

      return {
        ...segment,
        role,
        pace,
        importance,
        note: modelItem?.note?.trim() || undefined
      }
    })
  }
}

function splitIntoBatches(segments: StorySourceSegment[]): StorySourceSegment[][] {
  const batches: StorySourceSegment[][] = []
  let current: StorySourceSegment[] = []
  let chars = 0

  for (const segment of segments) {
    const segmentChars = segment.text.length
    if (
      current.length > 0 &&
      (current.length >= MAX_BATCH_SEGMENTS || chars + segmentChars > MAX_BATCH_CHARS)
    ) {
      batches.push(current)
      current = []
      chars = 0
    }
    current.push(segment)
    chars += segmentChars
  }
  if (current.length > 0) batches.push(current)
  return batches
}

export class StoryAgent {
  constructor(private readonly runtime: AgentRuntime) {}

  async analyze(
    segments: StorySourceSegment[],
    mode: AgentModelMode,
    signal?: AbortSignal
  ): Promise<StoryAnalysis> {
    return this.runtime.runWithFallback(
      mode,
      async () => {
        const batches = splitIntoBatches(segments)
        const analyzedSegments: StoryAnalysis['segments'] = []
        const summaries: string[] = []
        const tones: string[] = []

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
          if (signal?.aborted) throw new Error('任务已取消')
          const batch = batches[batchIndex]
          const output = await this.runtime.model.completeJson<StoryModelOutput>({
            signal,
            system:
              '你是小说短视频的 StoryAgent。你只分析结构和节奏，不改写原文，不删除原文，不生成剪辑素材。必须只返回 JSON。',
            user: JSON.stringify({
              task: '逐段标注小说结构与节奏。id 必须原样返回。输入只是全文的一批片段，要结合片段相对位置判断节奏。',
              batch: { index: batchIndex + 1, total: batches.length },
              roles: ['hook', 'setup', 'conflict', 'turn', 'climax', 'ending'],
              paces: ['slow', 'normal', 'fast', 'very-fast'],
              outputSchema: {
                summary: '本批内容一句话摘要',
                tone: 'string',
                segments: [
                  { id: 'seg-001', role: 'hook', pace: 'fast', importance: 0.9, note: 'string' }
                ]
              },
              segments: batch.map(({ id, index, text }) => ({ id, index, text }))
            })
          })
          const normalized = normalizeModelOutput(batch, output)
          analyzedSegments.push(...normalized.segments)
          if (normalized.summary) summaries.push(normalized.summary)
          if (normalized.tone) tones.push(normalized.tone)
        }

        return {
          summary: summaries.join(' / ').slice(0, 2000) || '小说结构分析完成。',
          tone: tones[0] || 'narrative',
          segments: analyzedSegments
        }
      },
      () => fallbackStory(segments)
    )
  }
}
