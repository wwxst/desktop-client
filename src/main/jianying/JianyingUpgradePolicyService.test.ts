import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { JianyingUpgradePolicyService } from './JianyingUpgradePolicyService'

const temporaryRoots: string[] = []

async function createProfiles(settings: string): Promise<{
  hostProfile: string
  runtimeProfile: string
  settingsPath: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'desktop-client-jianying-policy-'))
  temporaryRoots.push(root)
  const hostProfile = join(root, 'host-profile')
  const runtimeProfile = join(root, 'runtime-profile')
  const configDirectory = join(
    runtimeProfile,
    'AppData',
    'Local',
    'JianyingPro',
    'User Data',
    'Config'
  )
  await Promise.all([mkdir(hostProfile), mkdir(configDirectory, { recursive: true })])
  const settingsPath = join(configDirectory, 'globalSetting')
  await writeFile(settingsPath, settings)
  return { hostProfile, runtimeProfile, settingsPath }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

describe('JianyingUpgradePolicyService', () => {
  it('previews without writes and changes only the two upgrade switches after approval', async () => {
    const original = [
      '[General]',
      'currentCustomDraftPath=D:\\\\Drafts',
      'enableAutoUpdate=true',
      'unrelatedSetting=keep-me',
      'totalSilentUpgradeSwitch=true',
      ''
    ].join('\r\n')
    const fixture = await createProfiles(original)
    const service = new JianyingUpgradePolicyService({
      runtimeProfilePath: fixture.runtimeProfile,
      hostUserProfilePath: fixture.hostProfile,
      isJianyingRunning: () => false
    })

    expect(service.enabled).toBe(true)
    const preview = await service.previewNoUpgradePolicy()

    expect(preview.policy).toBe('deny')
    expect(preview.current).toEqual({ autoUpdateEnabled: true, silentUpgradeEnabled: true })
    expect(preview.proposed).toEqual({
      autoUpdateEnabled: false,
      silentUpgradeEnabled: false
    })
    expect(preview.requiresWrite).toBe(true)
    expect(await readFile(fixture.settingsPath, 'utf8')).toBe(original)

    const applied = await service.applyNoUpgradePolicy(preview.previewToken!)
    const expected = original
      .replace('enableAutoUpdate=true', 'enableAutoUpdate=false')
      .replace('totalSilentUpgradeSwitch=true', 'totalSilentUpgradeSwitch=false')
    expect(await readFile(fixture.settingsPath, 'utf8')).toBe(expected)
    expect(applied.changedKeys).toEqual(['enableAutoUpdate', 'totalSilentUpgradeSwitch'])
    expect(
      await readFile(
        join(
          fixture.runtimeProfile,
          'AppData',
          'Local',
          'JianyingPro',
          'User Data',
          'Config',
          '.desktop-client-backups',
          'upgrade-policy',
          applied.transactionId,
          'globalSetting.original'
        ),
        'utf8'
      )
    ).toBe(original)
    await expect(service.applyNoUpgradePolicy(preview.previewToken!)).rejects.toThrow(
      '不存在或已使用'
    )
  })

  it('returns a no-write preview when the deny policy is already active', async () => {
    const fixture = await createProfiles(
      ['[General]', 'enableAutoUpdate=false', 'totalSilentUpgradeSwitch=false'].join('\n')
    )
    const service = new JianyingUpgradePolicyService({
      runtimeProfilePath: fixture.runtimeProfile,
      hostUserProfilePath: fixture.hostProfile,
      isJianyingRunning: () => false
    })

    await expect(service.previewNoUpgradePolicy()).resolves.toMatchObject({
      policy: 'deny',
      previewToken: null,
      requiresWrite: false,
      expiresAt: null,
      writesPerformed: false
    })
  })

  it('restores exact bytes when verification fails after replacement', async () => {
    const original = ['[General]', 'enableAutoUpdate=true', 'totalSilentUpgradeSwitch=true'].join(
      '\n'
    )
    const fixture = await createProfiles(original)
    const service = new JianyingUpgradePolicyService({
      runtimeProfilePath: fixture.runtimeProfile,
      hostUserProfilePath: fixture.hostProfile,
      isJianyingRunning: () => false,
      failAfterReplace: () => {
        throw new Error('simulated failure')
      }
    })
    const preview = await service.previewNoUpgradePolicy()

    await expect(service.applyNoUpgradePolicy(preview.previewToken!)).rejects.toThrow('已自动恢复')
    expect(await readFile(fixture.settingsPath, 'utf8')).toBe(original)
  })

  it('rejects overlapping profiles and a running Jianying process', async () => {
    const fixture = await createProfiles(
      ['[General]', 'enableAutoUpdate=true', 'totalSilentUpgradeSwitch=true'].join('\n')
    )
    const overlapping = new JianyingUpgradePolicyService({
      runtimeProfilePath: fixture.runtimeProfile,
      hostUserProfilePath: fixture.runtimeProfile,
      isJianyingRunning: () => false
    })
    expect(overlapping.enabled).toBe(false)
    await expect(overlapping.previewNoUpgradePolicy()).rejects.toThrow('当前用户目录重叠')

    const running = new JianyingUpgradePolicyService({
      runtimeProfilePath: fixture.runtimeProfile,
      hostUserProfilePath: fixture.hostProfile,
      isJianyingRunning: () => true
    })
    const preview = await running.previewNoUpgradePolicy()
    await expect(running.applyNoUpgradePolicy(preview.previewToken!)).rejects.toThrow(
      '剪映正在运行'
    )
    expect(await readFile(fixture.settingsPath, 'utf8')).toContain('enableAutoUpdate=true')
  })
})
