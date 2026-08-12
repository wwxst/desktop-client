import type { AgentToolCall } from '../../../../shared/agent/workflow'
import type { EditorAgentApi } from '../SmartEdit/VideoEditorWorkspace/editorAgentApi'
import {
  getProjectDuration,
  resolveTimelineClip
} from '../SmartEdit/VideoEditorWorkspace/editorProject'

export interface AgentToolExecutionResult {
  success: boolean
  message: string
  data?: unknown
}

export function executeAgentToolCall(
  call: AgentToolCall,
  editorApi: EditorAgentApi | null
): AgentToolExecutionResult {
  if (!editorApi) return { success: false, message: '当前没有打开剪辑工程' }

  if (call.name === 'get_editor_context') {
    const project = editorApi.getProjectSnapshot()
    const selectedIds = new Set(editorApi.getSelection())
    return {
      success: true,
      message: '已读取当前剪辑工程',
      data: {
        aspectRatio: project.aspectRatio,
        duration: getProjectDuration(project),
        playhead: editorApi.getPlayhead(),
        assetCount: project.assets.length,
        trackCount: project.tracks.length,
        clipCount: project.clips.length,
        selectedClips: project.clips
          .filter((clip) => selectedIds.has(clip.id))
          .map((clip) => {
            const asset = project.assets.find((candidate) => candidate.id === clip.assetId) ?? null
            const resolved = resolveTimelineClip(clip, asset)
            return {
              id: clip.id,
              assetName: asset?.name ?? clip.assetId,
              trackId: clip.trackId,
              timelineStart: resolved.timelineStart,
              duration: resolved.duration
            }
          })
      }
    }
  }

  const selection = editorApi.getSelection()
  if (call.name === 'delete_selected_clips') {
    if (selection.length === 0) return { success: false, message: '请先在时间线中选择要删除的片段' }
    const result = editorApi.deleteClips?.(selection, {
      magnetMainTrack: call.arguments.magnetMainTrack === true
    })
    if (!result) return { success: false, message: '当前编辑器不支持删除工具' }
    return {
      success: result.success && result.changed,
      message:
        result.success && result.changed
          ? `已删除 ${selection.length} 个片段`
          : (result.message ?? '删除片段失败')
    }
  }

  if (call.name !== 'split_selected_clip') {
    return { success: false, message: '不支持的 AI 工具' }
  }
  if (selection.length !== 1) {
    return { success: false, message: '请先在时间线中只选择一个要分割的片段' }
  }
  const result = editorApi.splitClip?.(selection[0], editorApi.getPlayhead())
  if (!result) return { success: false, message: '当前编辑器不支持分割工具' }
  return {
    success: result.success && result.changed,
    message:
      result.success && result.changed
        ? '已在播放头位置分割所选片段'
        : (result.message ?? '分割片段失败')
  }
}
