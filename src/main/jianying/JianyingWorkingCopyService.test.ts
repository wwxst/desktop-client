import { createHash } from 'node:crypto'
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Draft, Segment } from 'capcut-cli'
import { afterEach, describe, expect, it } from 'vitest'
import { JianyingReadService } from './JianyingReadService'
import { JianyingWorkingCopyService } from './JianyingWorkingCopyService'

const temporaryRoots: string[] = []

function segment(id: string, materialId: string, start: number): Segment {
  return {
    id,
    material_id: materialId,
    target_timerange: { start, duration: 1_000_000 },
    source_timerange: { start: 0, duration: 1_000_000 },
    speed: 1,
    volume: 1,
    visible: true,
    clip: null,
    extra_material_refs: [],
    render_index: 0
  }
}

function draftFixture(): Draft {
  return {
    id: 'draft-1',
    name: 'fixture',
    duration: 2_000_000,
    fps: 30,
    canvas_config: { width: 1080, height: 1920, ratio: 'original' },
    platform: { app_source: 'lv', app_version: '5.9.0', os: 'windows' },
    tracks: [
      {
        id: 'track-video',
        type: 'video',
        name: '',
        attribute: 0,
        segments: [segment('video-segment', 'video-material', 0)]
      },
      {
        id: 'track-text',
        type: 'text',
        name: '',
        attribute: 0,
        segments: [
          segment('caption-alpha', 'text-alpha', 0),
          segment('caption-beta', 'text-beta', 1_000_000)
        ]
      },
      {
        id: 'track-audio',
        type: 'audio',
        name: '',
        attribute: 0,
        segments: [segment('audio-segment', 'audio-material', 0)]
      }
    ],
    materials: {
      videos: [
        {
          id: 'video-material',
          path: 'D:/media/video.mp4',
          material_name: 'video.mp4',
          type: 'video',
          duration: 2_000_000,
          width: 1080,
          height: 1920
        }
      ],
      audios: [
        {
          id: 'audio-material',
          path: 'D:/media/audio.wav',
          name: 'audio.wav',
          duration: 2_000_000,
          type: 'audio'
        }
      ],
      texts: [
        {
          id: 'text-alpha',
          type: 'text',
          content: JSON.stringify({ styles: [{ range: [0, 3], size: 8 }], text: '旧字幕' }),
          font_size: 8,
          text_color: '#FFFFFF',
          alignment: 1
        },
        {
          id: 'text-beta',
          type: 'text',
          content: JSON.stringify({ styles: [{ range: [0, 2], size: 8 }], text: '备用' }),
          font_size: 8,
          text_color: '#FFFFFF',
          alignment: 1
        }
      ],
      speeds: [],
      material_animations: [],
      audio_fades: [],
      transitions: []
    }
  }
}

async function createFixture(): Promise<{
  sourceRoot: string
  workingRoot: string
  sourceDirectory: string
  sourceBytes: Record<'draft_content.json' | 'template-2.tmp', Buffer>
}> {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'desktop-client-jianying-source-'))
  const workingRoot = await mkdtemp(join(tmpdir(), 'desktop-client-jianying-working-'))
  temporaryRoots.push(sourceRoot, workingRoot)
  const sourceDirectory = join(sourceRoot, 'fixture-draft')
  await mkdir(sourceDirectory)
  const timeline = Buffer.from(`${JSON.stringify(draftFixture(), null, 2)}\n`)
  const sourceBytes = {
    'draft_content.json': timeline,
    'template-2.tmp': Buffer.from(timeline)
  }
  await Promise.all(
    Object.entries(sourceBytes).map(([name, bytes]) =>
      writeFile(join(sourceDirectory, name), bytes)
    )
  )
  return { sourceRoot, workingRoot, sourceDirectory, sourceBytes }
}

function createService(
  sourceRoot: string,
  workingRoot: string,
  options: {
    isJianyingRunning?: () => boolean
    now?: () => number
    failPoint?: (point: 'after-canonical-replace' | 'after-mirror-replace') => void
  } = {}
): JianyingWorkingCopyService {
  return new JianyingWorkingCopyService({
    sourceDrafts: new JianyingReadService({ draftRoot: sourceRoot }),
    workingCopyRoot: workingRoot,
    ...options
  })
}

async function readPair(
  directory: string
): Promise<Record<'draft_content.json' | 'template-2.tmp', Buffer>> {
  return {
    'draft_content.json': await readFile(join(directory, 'draft_content.json')),
    'template-2.tmp': await readFile(join(directory, 'template-2.tmp'))
  }
}

function hashes(pair: Record<'draft_content.json' | 'template-2.tmp', Buffer>): string[] {
  return [pair['draft_content.json'], pair['template-2.tmp']].map((value) =>
    createHash('sha256').update(value).digest('hex')
  )
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

describe('JianyingWorkingCopyService', () => {
  it('copies a 5.9 draft without changing the source and previews without writes', async () => {
    const fixture = await createFixture()
    const sourceBefore = await readPair(fixture.sourceDirectory)
    const service = createService(fixture.sourceRoot, fixture.workingRoot)

    const prepared = await service.prepareWorkingCopy('fixture-draft')
    const workingDirectory = join(fixture.workingRoot, prepared.workingCopyId)
    const workingBefore = await readPair(workingDirectory)
    const preview = await service.previewTextChange(
      prepared.workingCopyId,
      'caption-alpha',
      '新字幕'
    )

    expect(prepared.sourceHashes['draft_content.json']).toBe(hashes(sourceBefore)[0])
    expect(await readPair(fixture.sourceDirectory)).toEqual(sourceBefore)
    expect(workingBefore).toEqual(sourceBefore)
    expect(preview.currentText).toBe('旧字幕')
    expect(preview.proposedStyleRange).toEqual([0, 3])
    expect(preview.writesPerformed).toBe(false)
    expect(await readPair(workingDirectory)).toEqual(workingBefore)
  })

  it('changes only the approved text fields, preserves track order, and restores exact bytes', async () => {
    const fixture = await createFixture()
    const service = createService(fixture.sourceRoot, fixture.workingRoot)
    const prepared = await service.prepareWorkingCopy('fixture-draft')
    const workingDirectory = join(fixture.workingRoot, prepared.workingCopyId)
    const before = await readPair(workingDirectory)
    const beforeJson = JSON.parse(before['draft_content.json'].toString()) as Draft
    const preview = await service.previewTextChange(
      prepared.workingCopyId,
      'caption-alpha',
      '你好 Agent'
    )

    const applied = await service.applyTextChange(preview.previewToken)
    const after = await readPair(workingDirectory)
    const afterJson = JSON.parse(after['draft_content.json'].toString()) as Draft
    const beforeContent = beforeJson.materials.texts[0].content
    const afterContent = afterJson.materials.texts[0].content
    const normalizedAfter = structuredClone(afterJson)
    normalizedAfter.materials.texts[0].content = beforeContent

    expect(after['draft_content.json']).toEqual(after['template-2.tmp'])
    expect(normalizedAfter).toEqual(beforeJson)
    expect(JSON.parse(afterContent)).toEqual({
      styles: [{ range: [0, 8], size: 8 }],
      text: '你好 Agent'
    })
    expect(afterJson.tracks.map((track) => track.type)).toEqual(['video', 'text', 'audio'])
    expect(
      await readFile(
        join(
          workingDirectory,
          '.desktop-client-backups',
          applied.transactionId,
          'draft_content.json.original'
        )
      )
    ).toEqual(before['draft_content.json'])

    await service.rollbackTextChange(prepared.workingCopyId, applied.transactionId)
    expect(await readPair(workingDirectory)).toEqual(before)
  })

  it('automatically restores both files when the second mirror has not been replaced', async () => {
    const fixture = await createFixture()
    const service = createService(fixture.sourceRoot, fixture.workingRoot, {
      failPoint: (point) => {
        if (point === 'after-canonical-replace') throw new Error('simulated failure')
      }
    })
    const prepared = await service.prepareWorkingCopy('fixture-draft')
    const workingDirectory = join(fixture.workingRoot, prepared.workingCopyId)
    const before = await readPair(workingDirectory)
    const preview = await service.previewTextChange(
      prepared.workingCopyId,
      'caption-alpha',
      '故障测试'
    )

    await expect(service.applyTextChange(preview.previewToken)).rejects.toThrow('已自动回滚')
    expect(await readPair(workingDirectory)).toEqual(before)
  })

  it('rejects stale previews, reused tokens, running Jianying, and unsafe rollback overwrite', async () => {
    const fixture = await createFixture()
    let running = false
    let now = Date.parse('2026-08-16T00:00:00.000Z')
    const service = createService(fixture.sourceRoot, fixture.workingRoot, {
      isJianyingRunning: () => running,
      now: () => now
    })
    const prepared = await service.prepareWorkingCopy('fixture-draft')
    const workingDirectory = join(fixture.workingRoot, prepared.workingCopyId)

    const expired = await service.previewTextChange(prepared.workingCopyId, 'caption-alpha', '过期')
    now += 10 * 60 * 1_000
    await expect(service.applyTextChange(expired.previewToken)).rejects.toThrow('已过期')

    const stale = await service.previewTextChange(prepared.workingCopyId, 'caption-alpha', '陈旧')
    const pair = await readPair(workingDirectory)
    const withWhitespace = Buffer.concat([pair['draft_content.json'], Buffer.from(' ')])
    await Promise.all([
      writeFile(join(workingDirectory, 'draft_content.json'), withWhitespace),
      writeFile(join(workingDirectory, 'template-2.tmp'), withWhitespace)
    ])
    await expect(service.applyTextChange(stale.previewToken)).rejects.toThrow('预览后已变更')
    await Promise.all([
      writeFile(join(workingDirectory, 'draft_content.json'), pair['draft_content.json']),
      writeFile(join(workingDirectory, 'template-2.tmp'), pair['template-2.tmp'])
    ])

    const preview = await service.previewTextChange(
      prepared.workingCopyId,
      'caption-alpha',
      '一次性'
    )
    const applied = await service.applyTextChange(preview.previewToken)
    await expect(service.applyTextChange(preview.previewToken)).rejects.toThrow('不存在或已使用')
    const changedAgain = await readPair(workingDirectory)
    const changedWithWhitespace = Buffer.concat([
      changedAgain['draft_content.json'],
      Buffer.from(' ')
    ])
    await Promise.all([
      writeFile(join(workingDirectory, 'draft_content.json'), changedWithWhitespace),
      writeFile(join(workingDirectory, 'template-2.tmp'), changedWithWhitespace)
    ])
    await expect(
      service.rollbackTextChange(prepared.workingCopyId, applied.transactionId)
    ).rejects.toThrow('已拒绝覆盖')

    running = true
    await expect(service.prepareWorkingCopy('fixture-draft')).rejects.toThrow('剪映正在运行')
  })

  it('completes ten preview, apply, verify, and byte-for-byte rollback cycles', async () => {
    const fixture = await createFixture()
    const service = createService(fixture.sourceRoot, fixture.workingRoot)
    const prepared = await service.prepareWorkingCopy('fixture-draft')
    const workingDirectory = join(fixture.workingRoot, prepared.workingCopyId)
    const original = await readPair(workingDirectory)

    for (let index = 0; index < 10; index += 1) {
      const preview = await service.previewTextChange(
        prepared.workingCopyId,
        'caption-alpha',
        `第 ${index + 1} 次安全修改`
      )
      const applied = await service.applyTextChange(preview.previewToken)
      const changed = await readPair(workingDirectory)
      expect(changed['draft_content.json']).toEqual(changed['template-2.tmp'])
      expect(hashes(changed)).toEqual([
        applied.afterHashes['draft_content.json'],
        applied.afterHashes['template-2.tmp']
      ])
      await service.rollbackTextChange(prepared.workingCopyId, applied.transactionId)
      expect(await readPair(workingDirectory)).toEqual(original)
    }
  }, 30_000)

  it('refuses a working-copy root that overlaps the real draft root', async () => {
    const fixture = await createFixture()
    const unsafeRoot = join(fixture.sourceRoot, 'nested-working-copies')
    const service = createService(fixture.sourceRoot, unsafeRoot)

    await expect(service.prepareWorkingCopy('fixture-draft')).rejects.toThrow(
      '必须与真实草稿根完全隔离'
    )
    await expect(access(unsafeRoot)).rejects.toThrow()
  })
})
