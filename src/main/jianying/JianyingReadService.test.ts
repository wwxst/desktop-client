import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Draft, Segment } from 'capcut-cli'
import { afterEach, describe, expect, it } from 'vitest'
import { JianyingReadService, readJianyingHostSettings } from './JianyingReadService'

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

function draftFixture(appVersion = '5.9.0'): Draft {
  return {
    id: 'draft-1',
    name: 'fixture',
    duration: 2_000_000,
    fps: 30,
    canvas_config: { width: 1080, height: 1920, ratio: 'original' },
    platform: { app_source: 'lv', app_version: appVersion, os: 'windows' },
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
          content: JSON.stringify({ styles: [{ range: [0, 3] }], text: '旧字幕' }),
          font_size: 8,
          text_color: '#FFFFFF',
          alignment: 1
        },
        {
          id: 'text-beta',
          type: 'text',
          content: JSON.stringify({ styles: [{ range: [0, 2] }], text: '备用' }),
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

async function createDraft(appVersion = '5.9.0'): Promise<{
  root: string
  draftDirectory: string
  canonicalPath: string
  mirrorPath: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'desktop-client-jianying-'))
  temporaryRoots.push(root)
  const draftDirectory = join(root, 'fixture-draft')
  await mkdir(draftDirectory)
  const content = JSON.stringify(draftFixture(appVersion))
  const canonicalPath = join(draftDirectory, 'draft_content.json')
  const mirrorPath = join(draftDirectory, 'template-2.tmp')
  await Promise.all([writeFile(canonicalPath, content), writeFile(mirrorPath, content)])
  return { root, draftDirectory, canonicalPath, mirrorPath }
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

describe('JianyingReadService', () => {
  it('reports exact launch blockers without enabling launch tools', async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-client-jianying-readiness-'))
    temporaryRoots.push(root)
    const executablePath = join(root, 'JianyingPro.exe')
    await writeFile(executablePath, 'fixture')
    const service = new JianyingReadService({
      executablePath,
      expectedVersion: '5.9.0.11632',
      autoUpdateEnabled: true,
      silentUpgradeEnabled: true,
      getExecutableVersion: () => '5.9.0.11632',
      isJianyingRunning: () => false
    })

    const status = service.environmentStatus()

    expect(status.executableVersion).toBe('5.9.0.11632')
    expect(status.expectedVersionMatches).toBe(true)
    expect(status.readyForControlledLaunch).toBe(false)
    expect(status.launchToolsEnabled).toBe(false)
    expect(status.launchBlockers.map((blocker) => blocker.code)).toEqual([
      'isolation-unconfigured',
      'auto-update-enabled',
      'silent-upgrade-enabled'
    ])
  })

  it('recognizes a separate Windows profile that satisfies launch prerequisites', async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-client-jianying-ready-'))
    temporaryRoots.push(root)
    const executablePath = join(root, 'JianyingPro.exe')
    const hostProfilePath = join(root, 'host-profile')
    const runtimeProfilePath = join(root, 'runtime-profile')
    await Promise.all([
      writeFile(executablePath, 'fixture'),
      mkdir(hostProfilePath),
      mkdir(runtimeProfilePath)
    ])
    const service = new JianyingReadService({
      executablePath,
      expectedVersion: '5.9.0.11632',
      autoUpdateEnabled: false,
      silentUpgradeEnabled: false,
      runtimeIsolationMode: 'separate-windows-user',
      runtimeProfilePath,
      hostUserProfilePath: hostProfilePath,
      getExecutableVersion: () => '5.9.0.11632',
      isJianyingRunning: () => false
    })

    const status = service.environmentStatus()

    expect(status.runtimeIsolation).toEqual({
      mode: 'separate-windows-user',
      profilePath: runtimeProfilePath,
      configured: true
    })
    expect(status.readyForControlledLaunch).toBe(true)
    expect(status.launchBlockers).toEqual([])
    expect(status.launchToolsEnabled).toBe(false)
  })

  it('blocks mismatched versions, running processes, and overlapping profiles', async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-client-jianying-blocked-'))
    temporaryRoots.push(root)
    const executablePath = join(root, 'JianyingPro.exe')
    const hostProfilePath = join(root, 'profile')
    const runtimeProfilePath = join(hostProfilePath, 'nested')
    await writeFile(executablePath, 'fixture')
    await mkdir(runtimeProfilePath, { recursive: true })
    const service = new JianyingReadService({
      executablePath,
      expectedVersion: '5.9.0.11632',
      autoUpdateEnabled: false,
      silentUpgradeEnabled: false,
      runtimeIsolationMode: 'separate-windows-user',
      runtimeProfilePath,
      hostUserProfilePath: hostProfilePath,
      getExecutableVersion: () => '5.9.1.1',
      isJianyingRunning: () => true
    })

    expect(service.environmentStatus().launchBlockers.map((blocker) => blocker.code)).toEqual([
      'version-mismatch',
      'process-running',
      'isolation-profile-invalid'
    ])
  })

  it('reads draft and update guards from the Jianying host settings', async () => {
    const localAppData = await mkdtemp(join(tmpdir(), 'desktop-client-jianying-settings-'))
    temporaryRoots.push(localAppData)
    const configDirectory = join(localAppData, 'JianyingPro', 'User Data', 'Config')
    await mkdir(configDirectory, { recursive: true })
    await writeFile(
      join(configDirectory, 'globalSetting'),
      [
        '[General]',
        'currentCustomDraftPath=D:\\\\JianyingPro Drafts',
        'enableAutoUpdate=true',
        'totalSilentUpgradeSwitch=true'
      ].join('\r\n')
    )

    expect(readJianyingHostSettings(localAppData)).toEqual({
      draftRoot: 'D:\\JianyingPro Drafts',
      autoUpdateEnabled: true,
      silentUpgradeEnabled: true
    })
  })

  it('inspects a Jianying 5.9 draft without reordering tracks or writing files', async () => {
    const fixture = await createDraft()
    const service = new JianyingReadService({ draftRoot: fixture.root })
    const before = await Promise.all([sha256(fixture.canonicalPath), sha256(fixture.mirrorPath)])

    const result = await service.inspectDraft('fixture-draft')

    expect(result.app).toBe('JianYing')
    expect(result.appVersion).toBe('5.9.0')
    expect(result.mirrorsInSync).toBe(true)
    expect(result.trackOrder).toEqual(['video', 'text', 'audio'])
    expect(result.segmentCount).toBe(4)
    expect(await Promise.all([sha256(fixture.canonicalPath), sha256(fixture.mirrorPath)])).toEqual(
      before
    )
  })

  it('previews Jianying character ranges and performs no writes', async () => {
    const fixture = await createDraft()
    const service = new JianyingReadService({ draftRoot: fixture.root })
    const before = await Promise.all([sha256(fixture.canonicalPath), sha256(fixture.mirrorPath)])

    const result = await service.previewTextChange('fixture-draft', 'caption-a', '你好a')

    expect(result.currentText).toBe('旧字幕')
    expect(result.nextText).toBe('你好a')
    expect(result.proposedStyleRange).toEqual([0, 3])
    expect(result.writesPerformed).toBe(false)
    expect(result.targetFiles).toEqual(['draft_content.json', 'template-2.tmp'])
    expect(await Promise.all([sha256(fixture.canonicalPath), sha256(fixture.mirrorPath)])).toEqual(
      before
    )
  })

  it('rejects unsupported versions, path traversal, and ambiguous segment prefixes', async () => {
    const fixture = await createDraft('11.1.0')
    const service = new JianyingReadService({ draftRoot: fixture.root })

    await expect(service.inspectDraft('fixture-draft')).rejects.toThrow('仅允许检查剪映 5.9')
    await expect(service.inspectDraft('..\\fixture-draft')).rejects.toThrow('草稿名称无效')

    const supported = await createDraft()
    const supportedService = new JianyingReadService({ draftRoot: supported.root })
    await expect(
      supportedService.previewTextChange('fixture-draft', 'caption-', '新字幕')
    ).rejects.toThrow('字幕片段 ID 前缀不唯一')
  })
})
