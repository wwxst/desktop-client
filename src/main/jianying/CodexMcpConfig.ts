import type { JianyingIsolationMode } from './JianyingReadService'

const READ_ONLY_TOOLS = [
  'jianying_environment_status',
  'jianying_inspect_draft',
  'jianying_preview_text_change',
  'jianying_preview_working_copy_text_change',
  'jianying_preview_no_upgrade_policy'
] as const

const WRITE_TOOLS = [
  'jianying_prepare_working_copy',
  'jianying_apply_text_change',
  'jianying_rollback_text_change',
  'jianying_apply_no_upgrade_policy'
] as const

const ALL_TOOLS = [
  'jianying_environment_status',
  'jianying_inspect_draft',
  'jianying_preview_text_change',
  'jianying_prepare_working_copy',
  'jianying_preview_working_copy_text_change',
  'jianying_apply_text_change',
  'jianying_rollback_text_change',
  'jianying_preview_no_upgrade_policy',
  'jianying_apply_no_upgrade_policy'
] as const

export interface JianyingMcpConfigOptions {
  command: string
  serverEntry: string
  draftRoot?: string
  workingCopyRoot?: string
  executablePath?: string
  expectedVersion?: string
  autoUpdateEnabled?: boolean | null
  silentUpgradeEnabled?: boolean | null
  runtimeIsolationMode?: JianyingIsolationMode
  runtimeProfilePath?: string
  hostUserProfilePath?: string
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

export function createJianyingMcpConfigArgs(options: JianyingMcpConfigOptions): string[] {
  const envEntries = [
    ['ELECTRON_RUN_AS_NODE', '1'],
    ['JIANYING_EXPECTED_VERSION', options.expectedVersion ?? '5.9.x'],
    ['JIANYING_AUTO_UPDATE_ENABLED', String(options.autoUpdateEnabled ?? 'unknown')],
    ['JIANYING_SILENT_UPGRADE_ENABLED', String(options.silentUpgradeEnabled ?? 'unknown')]
  ]
  envEntries.push(['JIANYING_ISOLATION_MODE', options.runtimeIsolationMode ?? 'none'])
  if (options.draftRoot) envEntries.push(['JIANYING_DRAFT_ROOT', options.draftRoot])
  if (options.workingCopyRoot) {
    envEntries.push(['JIANYING_WORKING_COPY_ROOT', options.workingCopyRoot])
  }
  if (options.executablePath) envEntries.push(['JIANYING_EXECUTABLE', options.executablePath])
  if (options.runtimeProfilePath) {
    envEntries.push(['JIANYING_RUNTIME_PROFILE', options.runtimeProfilePath])
  }
  if (options.hostUserProfilePath) {
    envEntries.push(['JIANYING_HOST_PROFILE', options.hostUserProfilePath])
  }

  const env = envEntries.map(([key, value]) => `${key} = ${tomlString(value)}`).join(', ')
  const enabledTools = ALL_TOOLS.map(tomlString).join(', ')
  const toolApprovals = WRITE_TOOLS.map((tool) => `${tool} = { approval_mode = "prompt" }`).join(
    ', '
  )
  const inlineTable = [
    `command = ${tomlString(options.command)}`,
    `args = [${tomlString(options.serverEntry)}]`,
    `env = { ${env} }`,
    'enabled = true',
    'required = true',
    `enabled_tools = [${enabledTools}]`,
    'default_tools_approval_mode = "auto"',
    `tools = { ${toolApprovals} }`,
    'startup_timeout_sec = 15',
    'tool_timeout_sec = 30'
  ].join(', ')

  return ['-c', `mcp_servers.jianying={ ${inlineTable} }`]
}

export const JIANYING_READ_ONLY_TOOLS = READ_ONLY_TOOLS
export const JIANYING_WRITE_TOOLS = WRITE_TOOLS
export const JIANYING_TOOLS = ALL_TOOLS
