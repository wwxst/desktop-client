import { describe, expect, it } from 'vitest'
import {
  createJianyingMcpConfigArgs,
  JIANYING_READ_ONLY_TOOLS,
  JIANYING_WRITE_TOOLS
} from './CodexMcpConfig'

describe('createJianyingMcpConfigArgs', () => {
  it('allows only the Jianying tools and prompts for each tool that writes a working copy', () => {
    const args = createJianyingMcpConfigArgs({
      command: 'C:\\Program Files\\Desktop Client\\app.exe',
      serverEntry: 'D:\\build "candidate"\\jianying-mcp.js',
      draftRoot: 'D:\\Jianying Drafts',
      workingCopyRoot: 'C:\\Desktop Client\\jianying-working-copies',
      executablePath: 'D:\\Jianying 5.9\\JianyingPro.exe',
      expectedVersion: '5.9.0.11632',
      autoUpdateEnabled: true,
      silentUpgradeEnabled: true,
      runtimeIsolationMode: 'separate-windows-user',
      runtimeProfilePath: 'C:\\Users\\JianyingAgent',
      hostUserProfilePath: 'C:\\Users\\Operator'
    })

    expect(args[0]).toBe('-c')
    expect(args[1]).toContain('mcp_servers.jianying={')
    expect(args[1]).toContain('default_tools_approval_mode = "auto"')
    expect(args[1]).toContain(
      `command = ${JSON.stringify('C:\\Program Files\\Desktop Client\\app.exe')}`
    )
    expect(args[1]).toContain(
      `args = [${JSON.stringify('D:\\build "candidate"\\jianying-mcp.js')}]`
    )
    expect(args[1]).toContain(`JIANYING_DRAFT_ROOT = ${JSON.stringify('D:\\Jianying Drafts')}`)
    expect(args[1]).toContain(
      `JIANYING_WORKING_COPY_ROOT = ${JSON.stringify('C:\\Desktop Client\\jianying-working-copies')}`
    )
    expect(args[1]).toContain('JIANYING_SILENT_UPGRADE_ENABLED = "true"')
    expect(args[1]).toContain('JIANYING_ISOLATION_MODE = "separate-windows-user"')
    expect(args[1]).toContain(
      `JIANYING_RUNTIME_PROFILE = ${JSON.stringify('C:\\Users\\JianyingAgent')}`
    )
    expect(args[1]).toContain(`JIANYING_HOST_PROFILE = ${JSON.stringify('C:\\Users\\Operator')}`)
    for (const tool of JIANYING_READ_ONLY_TOOLS) expect(args[1]).toContain(JSON.stringify(tool))
    for (const tool of JIANYING_WRITE_TOOLS) {
      expect(args[1]).toContain(JSON.stringify(tool))
      expect(args[1]).toContain(`${tool} = { approval_mode = "prompt" }`)
    }
    expect(args[1]).not.toMatch(/jianying_(write|launch|export|desktop_control)/)
  })
})
