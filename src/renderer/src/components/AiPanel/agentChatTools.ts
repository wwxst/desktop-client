import type { AgentToolCall, AgentToolExecutionResult } from '../../../../shared/agent/workflow'
import type { EditorAgentApi } from '../SmartEdit/VideoEditorWorkspace/editorAgentApi'
import {
  getProjectDuration,
  resolveTimelineClip
} from '../SmartEdit/VideoEditorWorkspace/editorProject'

export function executeAgentToolCall(
  call: AgentToolCall,
  editorApi: EditorAgentApi | null
): AgentToolExecutionResult {
  if (!editorApi) {
    return {
      success: false,
      code: 'EDITOR_UNAVAILABLE',
      message: '当前没有打开剪辑工程',
      changed: false,
      affectedClipIds: []
    }
  }

  if (call.name === 'get_editor_context') {
    const project = editorApi.getProjectSnapshot()
    const selectedIds = new Set(editorApi.getSelection())
    return {
      success: true,
      code: 'OK',
      message: '已读取当前剪辑工程',
      changed: false,
      affectedClipIds: [],
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

  return {
    success: false,
    code: 'AWAITING_APPROVAL',
    message: `已生成编辑计划，等待审批：${call.arguments.summary}`,
    changed: false,
    affectedClipIds: []
  }
}
