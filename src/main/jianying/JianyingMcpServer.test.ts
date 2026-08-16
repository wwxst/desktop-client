import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, describe, expect, it } from 'vitest'
import { JIANYING_READ_ONLY_TOOLS, JIANYING_TOOLS, JIANYING_WRITE_TOOLS } from './CodexMcpConfig'
import { createJianyingMcpServer } from './JianyingMcpServer'
import { JianyingReadService } from './JianyingReadService'
import { JianyingWorkingCopyService } from './JianyingWorkingCopyService'
import { JianyingUpgradePolicyService } from './JianyingUpgradePolicyService'

const closeCallbacks: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()))
})

describe('Jianying MCP server', () => {
  it('advertises read tools and approval-gated working-copy write tools', async () => {
    const service = new JianyingReadService({
      draftRoot: 'D:\\Jianying Drafts',
      executablePath: 'D:\\Jianying 5.9\\JianyingPro.exe',
      expectedVersion: '5.9.0.11632',
      autoUpdateEnabled: true,
      silentUpgradeEnabled: true
    })
    const workingCopies = new JianyingWorkingCopyService({
      sourceDrafts: service,
      workingCopyRoot: 'D:\\Desktop Client Working Copies'
    })
    const upgradePolicy = new JianyingUpgradePolicyService({
      runtimeProfilePath: 'C:\\Users\\JianyingAgent',
      hostUserProfilePath: 'C:\\Users\\Operator'
    })
    const server = createJianyingMcpServer(service, workingCopies, upgradePolicy)
    const client = new Client({ name: 'desktop-client-test', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    closeCallbacks.push(async () => {
      await client.close()
      await server.close()
    })

    const listed = await client.listTools()
    expect(listed.tools.map((tool) => tool.name)).toEqual(JIANYING_TOOLS)
    for (const tool of listed.tools.filter((tool) =>
      JIANYING_READ_ONLY_TOOLS.includes(tool.name as (typeof JIANYING_READ_ONLY_TOOLS)[number])
    )) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      })
    }
    for (const tool of listed.tools.filter((tool) =>
      JIANYING_WRITE_TOOLS.includes(tool.name as (typeof JIANYING_WRITE_TOOLS)[number])
    )) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: false,
        idempotentHint: false,
        openWorldHint: false
      })
    }
    expect(
      listed.tools.find((tool) => tool.name === 'jianying_prepare_working_copy')?.annotations
    ).toMatchObject({ destructiveHint: false })
    for (const name of [
      'jianying_apply_text_change',
      'jianying_rollback_text_change',
      'jianying_apply_no_upgrade_policy'
    ]) {
      expect(listed.tools.find((tool) => tool.name === name)?.annotations).toMatchObject({
        destructiveHint: true
      })
    }

    const status = await client.callTool({ name: 'jianying_environment_status', arguments: {} })
    expect(status.isError).not.toBe(true)
    expect(status.structuredContent).toMatchObject({
      expectedVersion: '5.9.0.11632',
      silentUpgradeEnabled: true,
      writeToolsEnabled: true,
      upgradePolicy: 'deny',
      upgradePolicyToolsEnabled: false,
      uiAutomationEnabled: false
    })
  })
})
