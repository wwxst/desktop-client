import { describe, expect, it } from 'vitest'
import { buildEditingPlan } from '../src/main/agent/planning/buildEditingPlan'
import { planToEditorCommands } from '../src/main/agent/tools/EditorTool'
import { buildSubtitleCues } from '../src/main/agent/tools/SubtitleTool'
import type {
  EditStrategy,
  MediaAsset,
  StoryAnalysis,
  TtsWorkflowOutput
} from '../src/shared/agent/editingPlan'

const voice: TtsWorkflowOutput = {
  audioPath: 'D:/agent/voice.wav',
  durationSeconds: 8,
  segments: [
    {
      id: 'seg-001',
      index: 0,
      text: '第一段小说正文，用来测试自动字幕和剪辑计划。',
      startSeconds: 0,
      endSeconds: 4,
      durationSeconds: 4,
      audioPath: 'D:/agent/001.wav'
    },
    {
      id: 'seg-002',
      index: 1,
      text: '第二段进入冲突，画面节奏应该更快。',
      startSeconds: 4,
      endSeconds: 8,
      durationSeconds: 4,
      audioPath: 'D:/agent/002.wav'
    }
  ]
}

const story: StoryAnalysis = {
  summary: '测试小说',
  tone: 'dramatic',
  segments: [
    {
      id: 'seg-001',
      index: 0,
      text: voice.segments[0].text,
      role: 'hook',
      pace: 'normal',
      importance: 0.8
    },
    {
      id: 'seg-002',
      index: 1,
      text: voice.segments[1].text,
      role: 'conflict',
      pace: 'fast',
      importance: 0.9
    }
  ]
}

const assets: MediaAsset[] = Array.from({ length: 5 }, (_, index) => ({
  id: `asset-${index + 1}`,
  path: `D:/media/${index + 1}.mp4`,
  fileName: `${index + 1}.mp4`,
  durationSeconds: 30,
  metadataSource: 'ffprobe' as const
}))

const strategy: EditStrategy = {
  veryFastClipSeconds: [1.5, 2],
  fastClipSeconds: [2, 2.5],
  normalClipSeconds: [3, 3.5],
  slowClipSeconds: [5, 6],
  avoidRecentAssetCount: 2,
  explanation: 'test'
}

describe('Agents V1 editing plan', () => {
  it('builds a gapless timeline matching the voice duration', () => {
    const subtitles = buildSubtitleCues(voice)
    const plan = buildEditingPlan({
      taskId: 'task-1',
      copyIndex: 0,
      title: 'test',
      story,
      voice,
      subtitles,
      assets,
      strategy,
      canvas: { width: 1080, height: 1920, fps: 30 },
      appName: 'Novel App',
      appIconPath: 'D:/app/icon.png',
      callToAction: '点击查看后续'
    })

    expect(plan.videoClips.length).toBeGreaterThan(1)
    expect(plan.videoClips[0].timelineStartSeconds).toBe(0)

    for (let i = 1; i < plan.videoClips.length; i += 1) {
      const previous = plan.videoClips[i - 1]
      expect(plan.videoClips[i].timelineStartSeconds).toBeCloseTo(
        previous.timelineStartSeconds + previous.durationSeconds,
        6
      )
    }

    const last = plan.videoClips.at(-1)!
    expect(last.timelineStartSeconds + last.durationSeconds).toBeCloseTo(voice.durationSeconds, 6)
    expect(plan.overlays.map((item) => item.kind)).toEqual(['app-name', 'cta'])
    expect(plan.imageOverlays[0]).toMatchObject({ kind: 'app-icon', sourcePath: 'D:/app/icon.png' })
  })

  it('creates deterministic but different plans for different copies', () => {
    const subtitles = buildSubtitleCues(voice)
    const base = {
      taskId: 'same-task',
      title: 'same-title',
      story,
      voice,
      subtitles,
      assets,
      strategy,
      canvas: { width: 1080, height: 1920, fps: 30 }
    }
    const first = buildEditingPlan({ ...base, copyIndex: 0 })
    const again = buildEditingPlan({ ...base, copyIndex: 0 })
    const second = buildEditingPlan({ ...base, copyIndex: 1 })

    expect(first.seed).toBe(again.seed)
    expect(first.videoClips.map((item) => item.assetId)).toEqual(
      again.videoClips.map((item) => item.assetId)
    )
    expect(first.seed).not.toBe(second.seed)
  })

  it('translates a plan to editor commands including subtitles and app icon', () => {
    const plan = buildEditingPlan({
      taskId: 'task-command',
      copyIndex: 0,
      title: 'command-test',
      story,
      voice,
      subtitles: buildSubtitleCues(voice),
      assets,
      strategy,
      canvas: { width: 1080, height: 1920, fps: 30 },
      appIconPath: 'D:/app/icon.png'
    })
    const commands = planToEditorCommands(plan)

    expect(commands.some((item) => item.type === 'subtitle.batchAdd')).toBe(true)
    expect(commands.some((item) => item.type === 'image.add')).toBe(true)
    expect(commands.some((item) => item.type === 'clip.add')).toBe(true)
  })

  it('never schedules a clip longer than its only short source asset', () => {
    const shortAssets = [{ ...assets[0], durationSeconds: 0.5 }]
    const plan = buildEditingPlan({
      taskId: 'short-asset',
      copyIndex: 0,
      title: 'short-asset',
      story,
      voice: {
        ...voice,
        durationSeconds: 2,
        segments: [{ ...voice.segments[0], endSeconds: 2, durationSeconds: 2 }]
      },
      subtitles: buildSubtitleCues(voice),
      assets: shortAssets,
      strategy,
      canvas: { width: 1080, height: 1920, fps: 30 }
    })

    expect(plan.videoClips.every((clip) => clip.durationSeconds <= 0.5)).toBe(true)
    expect(
      plan.videoClips.at(-1)!.timelineStartSeconds + plan.videoClips.at(-1)!.durationSeconds
    ).toBeCloseTo(2, 6)
  })
})
