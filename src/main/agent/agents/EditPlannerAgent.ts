import type { EditStrategy, StoryAnalysis } from '../../../shared/agent/editingPlan'
import type { AgentModelMode } from '../../../shared/agent/workflow'
import { AgentRuntime } from '../runtime/AgentRuntime'

interface StrategyModelOutput {
  veryFastClipSeconds?: [number, number]
  fastClipSeconds?: [number, number]
  normalClipSeconds?: [number, number]
  slowClipSeconds?: [number, number]
  avoidRecentAssetCount?: number
  explanation?: string
}

const DEFAULT_STRATEGY: EditStrategy = {
  veryFastClipSeconds: [1.6, 2.8],
  fastClipSeconds: [2.5, 4],
  normalClipSeconds: [4, 6],
  slowClipSeconds: [5.5, 8],
  avoidRecentAssetCount: 3,
  explanation: '解压类小说推文默认策略：开场和高潮更快，普通叙事保持稳定换画面。'
}

function range(
  value: unknown,
  fallback: [number, number],
  min: number,
  max: number
): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return fallback
  const a = Number(value[0])
  const b = Number(value[1])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return fallback
  const low = Math.max(min, Math.min(max, Math.min(a, b)))
  const high = Math.max(low, Math.min(max, Math.max(a, b)))
  return [low, high]
}

function normalize(output: StrategyModelOutput): EditStrategy {
  return {
    veryFastClipSeconds: range(
      output.veryFastClipSeconds,
      DEFAULT_STRATEGY.veryFastClipSeconds,
      1.2,
      4
    ),
    fastClipSeconds: range(output.fastClipSeconds, DEFAULT_STRATEGY.fastClipSeconds, 1.8, 6),
    normalClipSeconds: range(output.normalClipSeconds, DEFAULT_STRATEGY.normalClipSeconds, 2.5, 9),
    slowClipSeconds: range(output.slowClipSeconds, DEFAULT_STRATEGY.slowClipSeconds, 3.5, 12),
    avoidRecentAssetCount: Math.round(
      Math.min(8, Math.max(1, Number(output.avoidRecentAssetCount) || 3))
    ),
    explanation: output.explanation?.trim() || DEFAULT_STRATEGY.explanation
  }
}

export class EditPlannerAgent {
  constructor(private readonly runtime: AgentRuntime) {}

  async createStrategy(
    story: StoryAnalysis,
    mode: AgentModelMode,
    signal?: AbortSignal
  ): Promise<EditStrategy> {
    return this.runtime.runWithFallback(
      mode,
      async () => {
        const output = await this.runtime.model.completeJson<StrategyModelOutput>({
          signal,
          system:
            '你是解压类小说推文的 EditPlannerAgent。你负责给出剪辑节奏参数，不负责逐个随机挑素材。必须返回 JSON。',
          user: JSON.stringify({
            task: '根据小说节奏地图，给出四档换画面秒数范围。解压素材无需逐句剧情匹配，重点是留存和节奏。',
            constraints: {
              veryFast: '1.2-4秒',
              fast: '1.8-6秒',
              normal: '2.5-9秒',
              slow: '3.5-12秒',
              avoidRecentAssetCount: '1-8'
            },
            story: {
              summary: story.summary,
              tone: story.tone,
              segments: story.segments.map(({ id, role, pace, importance }) => ({
                id,
                role,
                pace,
                importance
              }))
            }
          })
        })
        return normalize(output)
      },
      () => DEFAULT_STRATEGY
    )
  }
}
