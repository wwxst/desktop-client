import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { JianyingReadService, parseJianyingIsolationMode } from './JianyingReadService'
import { createJianyingMcpServer } from './JianyingMcpServer'
import { JianyingWorkingCopyService } from './JianyingWorkingCopyService'
import { JianyingUpgradePolicyService } from './JianyingUpgradePolicyService'

const service = new JianyingReadService({
  draftRoot: process.env.JIANYING_DRAFT_ROOT,
  executablePath: process.env.JIANYING_EXECUTABLE,
  expectedVersion: process.env.JIANYING_EXPECTED_VERSION,
  autoUpdateEnabled:
    process.env.JIANYING_AUTO_UPDATE_ENABLED === 'true'
      ? true
      : process.env.JIANYING_AUTO_UPDATE_ENABLED === 'false'
        ? false
        : null,
  silentUpgradeEnabled:
    process.env.JIANYING_SILENT_UPGRADE_ENABLED === 'true'
      ? true
      : process.env.JIANYING_SILENT_UPGRADE_ENABLED === 'false'
        ? false
        : null,
  runtimeIsolationMode: parseJianyingIsolationMode(process.env.JIANYING_ISOLATION_MODE),
  runtimeProfilePath: process.env.JIANYING_RUNTIME_PROFILE,
  hostUserProfilePath: process.env.JIANYING_HOST_PROFILE ?? process.env.USERPROFILE
})

const workingCopies = new JianyingWorkingCopyService({
  sourceDrafts: service,
  workingCopyRoot: process.env.JIANYING_WORKING_COPY_ROOT
})

const upgradePolicy = new JianyingUpgradePolicyService({
  runtimeProfilePath: process.env.JIANYING_RUNTIME_PROFILE,
  hostUserProfilePath: process.env.JIANYING_HOST_PROFILE ?? process.env.USERPROFILE
})

const server = createJianyingMcpServer(service, workingCopies, upgradePolicy)

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport())
}

main().catch((error) => {
  console.error('Jianying MCP Server:', error)
  process.exitCode = 1
})
