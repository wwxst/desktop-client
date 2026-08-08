import { createHash } from 'node:crypto'
import type {
  EditStrategy,
  EditingPlan,
  MediaAsset,
  StoryAnalysis,
  StoryPace,
  SubtitleCue,
  TtsWorkflowOutput,
  VideoClipPlan
} from '../../../shared/agent/editingPlan'

export interface BuildEditingPlanOptions {
  taskId: string
  copyIndex: number
  title: string
  story: StoryAnalysis
  voice: TtsWorkflowOutput
  subtitles: SubtitleCue[]
  assets: MediaAsset[]
  strategy: EditStrategy
  canvas: { width: number; height: number; fps: number }
  appName?: string
  appIconPath?: string
  callToAction?: string
}

function hashSeed(value: string): number {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 8)
  return Number.parseInt(hex, 16) >>> 0
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function randomBetween(random: () => number, range: [number, number]): number {
  return range[0] + (range[1] - range[0]) * random()
}

function paceRange(strategy: EditStrategy, pace: StoryPace): [number, number] {
  if (pace === 'very-fast') return strategy.veryFastClipSeconds
  if (pace === 'fast') return strategy.fastClipSeconds
  if (pace === 'slow') return strategy.slowClipSeconds
  return strategy.normalClipSeconds
}

function chooseAsset(
  assets: MediaAsset[],
  neededDuration: number,
  recentIds: string[],
  random: () => number
): MediaAsset {
  const eligible = assets.filter(
    (asset) =>
      asset.durationSeconds >= Math.max(neededDuration + 0.1, 1.5) && !recentIds.includes(asset.id)
  )
  const relaxed = assets.filter(
    (asset) => asset.durationSeconds >= Math.max(neededDuration + 0.1, 1.5)
  )
  const pool = eligible.length > 0 ? eligible : relaxed.length > 0 ? relaxed : assets
  return pool[Math.floor(random() * pool.length)]
}

export function buildEditingPlan(options: BuildEditingPlanOptions): EditingPlan {
  if (options.assets.length === 0) throw new Error('没有可用于剪辑的视频素材')
  if (options.voice.durationSeconds <= 0) throw new Error('配音时长无效')

  const seed = hashSeed(`${options.taskId}:${options.copyIndex}:${options.title}`)
  const random = mulberry32(seed)
  const recentIds: string[] = []
  const videoClips: VideoClipPlan[] = []
  let clipCounter = 0

  const analysisById = new Map(options.story.segments.map((segment) => [segment.id, segment]))

  for (const voiceSegment of options.voice.segments) {
    const analysis = analysisById.get(voiceSegment.id)
    const range = paceRange(options.strategy, analysis?.pace ?? 'normal')
    let cursor = voiceSegment.startSeconds
    const segmentEnd = voiceSegment.endSeconds

    while (cursor < segmentEnd - 0.001) {
      const remaining = segmentEnd - cursor
      const target = Math.min(remaining, randomBetween(random, range))
      const asset = chooseAsset(options.assets, Math.max(0.15, target), recentIds, random)
      const availableDuration = Math.max(0.001, asset.durationSeconds)
      const duration = Math.min(remaining, Math.max(0.15, target), availableDuration)
      const maxSourceStart = Math.max(0, asset.durationSeconds - duration)
      const sourceStartSeconds = maxSourceStart > 0 ? random() * maxSourceStart : 0

      clipCounter += 1
      videoClips.push({
        id: `clip-${String(clipCounter).padStart(4, '0')}`,
        assetId: asset.id,
        sourcePath: asset.path,
        timelineStartSeconds: cursor,
        durationSeconds: duration,
        sourceStartSeconds,
        sourceDurationSeconds: Math.min(duration, asset.durationSeconds)
      })

      recentIds.push(asset.id)
      while (recentIds.length > options.strategy.avoidRecentAssetCount) recentIds.shift()
      cursor += duration
    }
  }

  const finalClip = videoClips.at(-1)
  if (finalClip) {
    const end = finalClip.timelineStartSeconds + finalClip.durationSeconds
    const delta = options.voice.durationSeconds - end
    if (Math.abs(delta) > 0.001) {
      const assetDuration =
        options.assets.find((asset) => asset.id === finalClip.assetId)?.durationSeconds ??
        finalClip.durationSeconds
      finalClip.durationSeconds = Math.min(
        assetDuration,
        Math.max(0.001, finalClip.durationSeconds + delta)
      )
      finalClip.sourceDurationSeconds = Math.min(finalClip.durationSeconds, assetDuration)
    }
  }

  const overlays = [] as EditingPlan['overlays']
  if (options.appName?.trim()) {
    overlays.push({
      id: 'overlay-app-name',
      text: options.appName.trim(),
      startSeconds: 0,
      endSeconds: options.voice.durationSeconds,
      kind: 'app-name'
    })
  }
  if (options.callToAction?.trim()) {
    overlays.push({
      id: 'overlay-cta',
      text: options.callToAction.trim(),
      startSeconds: Math.max(0, options.voice.durationSeconds - 8),
      endSeconds: options.voice.durationSeconds,
      kind: 'cta'
    })
  }

  const imageOverlays = [] as EditingPlan['imageOverlays']
  if (options.appIconPath?.trim()) {
    imageOverlays.push({
      id: 'overlay-app-icon',
      sourcePath: options.appIconPath.trim(),
      startSeconds: 0,
      endSeconds: options.voice.durationSeconds,
      kind: 'app-icon',
      anchor: 'top-right',
      widthRatio: 0.12
    })
  }

  return {
    version: 1,
    id: `${options.taskId}-copy-${options.copyIndex + 1}`,
    seed,
    title: options.title,
    durationSeconds: options.voice.durationSeconds,
    canvas: options.canvas,
    videoClips,
    voice: {
      id: 'voice-main',
      sourcePath: options.voice.audioPath,
      timelineStartSeconds: 0,
      durationSeconds: options.voice.durationSeconds,
      volume: 1
    },
    subtitles: options.subtitles,
    overlays,
    imageOverlays,
    metadata: {
      workflow: 'novel-decompression-v1',
      createdAt: Date.now()
    }
  }
}
