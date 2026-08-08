import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { NovelDecompressionWorkflow } from '../src/main/agent/workflows/NovelDecompressionWorkflow'
import type { NovelWorkflowDependencies } from '../src/main/agent/workflows/NovelDecompressionWorkflow'

vi.mock('electron', () => ({
  app: {
    getAppPath: () => process.cwd(),
    getPath: () => join(tmpdir(), 'desktop-client-agent-tests'),
    isPackaged: false
  }
}))

function createDependencies(
  audioPath = join(tmpdir(), 'agent-voice.wav')
): NovelWorkflowDependencies {
  const sourceSegment = { id: 'seg-001', index: 0, text: 'a'.repeat(20) }
  const voice = {
    audioPath,
    durationSeconds: 1,
    segments: [
      {
        ...sourceSegment,
        startSeconds: 0,
        endSeconds: 1,
        durationSeconds: 1,
        audioPath: 'D:/seg.wav'
      }
    ]
  }
  const story = {
    summary: 'summary',
    tone: 'narrative',
    segments: [
      { ...sourceSegment, role: 'setup' as const, pace: 'normal' as const, importance: 0.5 }
    ]
  }
  const strategy = {
    veryFastClipSeconds: [1, 1.5] as [number, number],
    fastClipSeconds: [1.5, 2] as [number, number],
    normalClipSeconds: [2, 2.5] as [number, number],
    slowClipSeconds: [2.5, 3] as [number, number],
    avoidRecentAssetCount: 1,
    explanation: 'test'
  }

  return {
    storyAgent: { analyze: vi.fn(async () => story) } as never,
    editPlannerAgent: { createStrategy: vi.fn(async () => strategy) } as never,
    reviewAgent: { review: vi.fn(async () => ({ passed: true, score: 100, issues: [] })) } as never,
    ttsTool: {
      segmentText: vi.fn(() => [sourceSegment]),
      synthesize: vi.fn(async () => voice)
    } as never,
    subtitleTool: {
      build: vi.fn(() => []),
      writeSrt: vi.fn(async () => undefined)
    } as never,
    mediaTool: {
      scan: vi.fn(async () => [
        {
          id: 'asset-1',
          path: 'D:/clip.mp4',
          fileName: 'clip.mp4',
          durationSeconds: 10,
          metadataSource: 'fallback' as const
        }
      ])
    } as never,
    editorTool: {
      stage: vi.fn(async () => ({
        planPath: 'D:/plan.json',
        commandPath: 'D:/commands.json',
        commands: []
      }))
    } as never,
    exportTool: { export: vi.fn() } as never
  }
}

function request(outputDirectory: string, overrides: Record<string, unknown> = {}): never {
  return {
    novelText: 'a'.repeat(20),
    mediaDirectory: 'D:/media',
    outputDirectory,
    tts: { language: 'zh-CN', modelId: 'model', voiceId: 'voice', speed: 1 },
    modelMode: 'disabled',
    ...overrides
  } as never
}

describe('NovelDecompressionWorkflow validation', () => {
  it('normalizes non-finite copies to one artifact', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'agent-workflow-'))
    const audioPath = join(outputDirectory, 'source.wav')
    await writeFile(audioPath, 'test audio')
    const workflow = new NovelDecompressionWorkflow(createDependencies(audioPath))

    const result = await workflow.run(request(outputDirectory, { copies: Number.NaN }), {
      taskId: 'task-1',
      signal: new AbortController().signal,
      emit: vi.fn()
    })

    expect(result.artifacts).toHaveLength(1)
  })

  it('rejects invalid canvas values before invoking TTS', async () => {
    const deps = createDependencies()
    const workflow = new NovelDecompressionWorkflow(deps)

    await expect(
      workflow.run(request('D:/output', { canvas: { width: 0, height: 1920, fps: 30 } }), {
        taskId: 'task-2',
        signal: new AbortController().signal,
        emit: vi.fn()
      })
    ).rejects.toThrow()
    expect(deps.ttsTool.segmentText).not.toHaveBeenCalled()
  })

  it('uses bundled media tools when paths are omitted', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'agent-workflow-'))
    const audioPath = join(outputDirectory, 'source.wav')
    await writeFile(audioPath, 'test audio')
    const deps = createDependencies(audioPath)
    const workflow = new NovelDecompressionWorkflow(deps)

    await workflow.run(request(outputDirectory, { export: { enabled: true } }), {
      taskId: 'task-3',
      signal: new AbortController().signal,
      emit: vi.fn()
    })

    const expectedBin = join(process.cwd(), 'resources', 'ffmpeg')
    const scanCall = (deps.mediaTool.scan as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    const exportCall = (deps.exportTool.export as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(scanCall[1]).toBe(join(expectedBin, 'ffprobe.exe'))
    expect(exportCall[3]).toBe(join(expectedBin, 'ffmpeg.exe'))
  })
})
