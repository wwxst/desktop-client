import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import { JianyingReadService } from './JianyingReadService'
import { JianyingWorkingCopyService } from './JianyingWorkingCopyService'
import { JianyingUpgradePolicyService } from './JianyingUpgradePolicyService'

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const

const workingCopyAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
} as const

const destructiveAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false
} as const

function toolResult(value: object): {
  content: Array<{ type: 'text'; text: string }>
  structuredContent: Record<string, unknown>
} {
  const structuredContent = { ...value }
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent
  }
}

function toolError(error: unknown): {
  content: Array<{ type: 'text'; text: string }>
  isError: true
} {
  return {
    content: [{ type: 'text', text: error instanceof Error ? error.message : '剪映工具执行失败' }],
    isError: true
  }
}

export function createJianyingMcpServer(
  service: JianyingReadService,
  workingCopies?: JianyingWorkingCopyService,
  upgradePolicy?: JianyingUpgradePolicyService
): McpServer {
  const server = new McpServer(
    { name: 'desktop-client-jianying', version: '0.1.0' },
    {
      instructions:
        'Real Jianying drafts are read-only. Controlled writes are allowed only in application-managed working copies. Always prepare a working copy, preview a text change, obtain user approval, and then apply it. Use rollback when requested or when verification fails. The upgrade policy is always deny: never enable automatic or silent upgrades. No tool launches Jianying, controls the desktop, edits a real draft, or exports video.'
    }
  )

  server.registerTool(
    'jianying_environment_status',
    {
      title: '检查剪映 5.9 环境',
      description: '读取剪映 5.9 可执行文件、草稿根目录、自动更新和工具安全状态。',
      annotations: readOnlyAnnotations
    },
    async () =>
      toolResult({
        ...service.environmentStatus(),
        writeToolsEnabled: workingCopies?.enabled === true,
        upgradePolicyToolsEnabled: upgradePolicy?.enabled === true
      })
  )

  server.registerTool(
    'jianying_inspect_draft',
    {
      title: '检查剪映 5.9 草稿',
      description: '按草稿名称读取版本、时间线镜像、轨道、片段和字幕，不修改任何文件。',
      inputSchema: {
        draftName: z.string().min(1).max(255).describe('草稿根目录下的直接子目录名称')
      },
      annotations: readOnlyAnnotations
    },
    async ({ draftName }) => {
      try {
        return toolResult(await service.inspectDraft(draftName))
      } catch (error) {
        return toolError(error)
      }
    }
  )

  server.registerTool(
    'jianying_preview_text_change',
    {
      title: '预览剪映字幕修改',
      description: '生成一条字幕修改的结构化预览和安全检查清单，不写入草稿。',
      inputSchema: {
        draftName: z.string().min(1).max(255).describe('草稿根目录下的直接子目录名称'),
        segmentId: z.string().min(1).max(300).describe('字幕片段 ID 或唯一前缀'),
        text: z.string().min(1).max(20_000).describe('准备替换的新字幕文本')
      },
      annotations: readOnlyAnnotations
    },
    async ({ draftName, segmentId, text }) => {
      try {
        return toolResult(await service.previewTextChange(draftName, segmentId, text))
      } catch (error) {
        return toolError(error)
      }
    }
  )

  if (workingCopies)
    server.registerTool(
      'jianying_prepare_working_copy',
      {
        title: '准备剪映草稿工作副本',
        description: '把指定剪映 5.9 草稿复制到应用隔离目录并校验原始字节，不修改源草稿。',
        inputSchema: {
          sourceDraftName: z.string().min(1).max(255).describe('真实草稿根目录下的直接子目录名称')
        },
        annotations: workingCopyAnnotations
      },
      async ({ sourceDraftName }) => {
        try {
          return toolResult(await workingCopies.prepareWorkingCopy(sourceDraftName))
        } catch (error) {
          return toolError(error)
        }
      }
    )

  if (workingCopies)
    server.registerTool(
      'jianying_preview_working_copy_text_change',
      {
        title: '预览工作副本字幕修改',
        description: '生成一次性字幕修改预览令牌，不写入工作副本。',
        inputSchema: {
          workingCopyId: z.uuid().describe('应用创建的工作副本 ID'),
          segmentId: z.string().min(1).max(300).describe('字幕片段 ID 或唯一前缀'),
          text: z.string().min(1).max(20_000).describe('准备替换的新字幕文本')
        },
        annotations: readOnlyAnnotations
      },
      async ({ workingCopyId, segmentId, text }) => {
        try {
          return toolResult(await workingCopies.previewTextChange(workingCopyId, segmentId, text))
        } catch (error) {
          return toolError(error)
        }
      }
    )

  if (workingCopies)
    server.registerTool(
      'jianying_apply_text_change',
      {
        title: '应用工作副本字幕修改',
        description: '使用未过期的一次性预览令牌修改隔离工作副本，写前备份并在失败时自动回滚。',
        inputSchema: {
          previewToken: z.uuid().describe('预览工具返回的一次性令牌')
        },
        annotations: destructiveAnnotations
      },
      async ({ previewToken }) => {
        try {
          return toolResult(await workingCopies.applyTextChange(previewToken))
        } catch (error) {
          return toolError(error)
        }
      }
    )

  if (workingCopies)
    server.registerTool(
      'jianying_rollback_text_change',
      {
        title: '回滚工作副本字幕修改',
        description: '把隔离工作副本恢复为指定事务的原始字节；存在后续修改时拒绝覆盖。',
        inputSchema: {
          workingCopyId: z.uuid().describe('应用创建的工作副本 ID'),
          transactionId: z.uuid().describe('成功应用工具返回的事务 ID')
        },
        annotations: destructiveAnnotations
      },
      async ({ workingCopyId, transactionId }) => {
        try {
          return toolResult(await workingCopies.rollbackTextChange(workingCopyId, transactionId))
        } catch (error) {
          return toolError(error)
        }
      }
    )

  if (upgradePolicy) {
    server.registerTool(
      'jianying_preview_no_upgrade_policy',
      {
        title: '预览剪映禁止升级策略',
        description: '检查隔离 Windows 用户的剪映升级开关，并预览将两个开关固定为关闭；不写文件。',
        annotations: readOnlyAnnotations
      },
      async () => {
        try {
          return toolResult(await upgradePolicy.previewNoUpgradePolicy())
        } catch (error) {
          return toolError(error)
        }
      }
    )

    server.registerTool(
      'jianying_apply_no_upgrade_policy',
      {
        title: '应用剪映禁止升级策略',
        description: '经审批后只把隔离用户 globalSetting 的自动更新和静默升级开关设为 false。',
        inputSchema: {
          previewToken: z.uuid().describe('禁止升级策略预览返回的一次性令牌')
        },
        annotations: destructiveAnnotations
      },
      async ({ previewToken }) => {
        try {
          return toolResult(await upgradePolicy.applyNoUpgradePolicy(previewToken))
        } catch (error) {
          return toolError(error)
        }
      }
    )
  }

  return server
}
