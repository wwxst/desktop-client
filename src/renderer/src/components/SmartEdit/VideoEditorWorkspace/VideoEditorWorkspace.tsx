import type { JSX } from 'react'
import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import FunctionPanel from './FunctionPanel'
import ParameterPanel from './ParameterPanel'
import PlayerPanel from './PlayerPanel'
import Timeline from './Timeline'
import {
  createEditorAgentApi,
  registerEditorAgentApi
} from './editorAgentApi'
import type { ClipPatch, EditorCommand } from './editorCommands'
import {
  createInitialEditorHistoryState,
  editorHistoryReducer
} from './editorHistory'
import {
  selectActiveAsset,
  selectActiveClip,
  type CanvasAspectRatio,
  type EditorProjectAction,
  type EditorTrack
} from './editorProject'
import { useMediaLibrary } from './useMediaLibrary'
import './VideoEditorWorkspace.css'

/**
 * 视频编辑工作区 V1：
 * - 真正的轨道/片段数据模型
 * - Command 驱动剪辑
 * - Undo / Redo
 * - Agent API 注册
 * - 时间线、播放头、右侧参数同步
 */
function VideoEditorWorkspace(): JSX.Element {
  const [history, dispatch] = useReducer(editorHistoryReducer, undefined, () =>
    createInitialEditorHistoryState(crypto.randomUUID())
  )
  const project = history.present

  const dispatchProjectAction = useCallback((action: EditorProjectAction): void => {
    dispatch({ type: 'project/action', action })
  }, [])

  const execute = useCallback((command: EditorCommand): void => {
    dispatch({ type: 'command/execute', command })
  }, [])

  const executeBatch = useCallback((commands: readonly EditorCommand[]): void => {
    dispatch({ type: 'command/batch', commands })
  }, [])

  const undo = useCallback((): void => dispatch({ type: 'history/undo' }), [])
  const redo = useCallback((): void => dispatch({ type: 'history/redo' }), [])

  const { importMediaFiles, reportMediaError } = useMediaLibrary(dispatchProjectAction)
  const addedMediaIds = useMemo<Set<string>>(
    () => new Set(project.clips.map((clip) => clip.assetId)),
    [project.clips]
  )
  const activeAsset = selectActiveAsset(project)
  const activeClip = selectActiveClip(project)
  const activeTrack = activeClip
    ? (project.tracks.find((track) => track.id === activeClip.trackId) ?? null)
    : null

  const handleAddMedia = (mediaId: string): void => {
    execute({
      type: 'clip/addAsset',
      assetId: mediaId,
      clipId: crypto.randomUUID()
    })
  }

  const handleSelectClip = (clipId: string): void => {
    dispatchProjectAction({ type: 'timeline/clipSelected', clipId })
  }

  const handleSetPlayhead = (time: number): void => {
    dispatchProjectAction({ type: 'timeline/playheadChanged', time })
  }

  const handleAspectRatioChange = (aspectRatio: CanvasAspectRatio): void => {
    execute({ type: 'canvas/setAspectRatio', aspectRatio })
  }

  const handleUpdateClip = (patch: ClipPatch): void => {
    if (!activeClip) return
    execute({ type: 'clip/update', clipId: activeClip.id, patch })
  }

  const handleUpdateTrack = (
    trackId: string,
    patch: Partial<Pick<EditorTrack, 'locked' | 'hidden' | 'muted' | 'name'>>
  ): void => {
    execute({ type: 'track/update', trackId, patch })
  }

  const agentApi = useMemo(
    () =>
      createEditorAgentApi({
        getProject: () => project,
        execute,
        executeBatch,
        undo,
        redo
      }),
    [execute, executeBatch, project, redo, undo]
  )

  useEffect(() => registerEditorAgentApi(agentApi), [agentApi])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      if (isTyping) return

      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && activeClip) {
        event.preventDefault()
        execute({ type: 'clip/delete', clipId: activeClip.id })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeClip, execute, redo, undo])

  return (
    <section className="studio-workspace" aria-label="剪辑工作区">
      <Group
        className="studio-workspace__rows"
        orientation="vertical"
        resizeTargetMinimumSize={{ fine: 8, coarse: 16 }}
      >
        <Panel id="workspace-top" defaultSize="64" minSize={280}>
          <div className="studio-workspace__top">
            <Group
              className="studio-workspace__columns"
              orientation="horizontal"
              resizeTargetMinimumSize={{ fine: 8, coarse: 16 }}
            >
              <Panel
                id="function-panel"
                defaultSize={148}
                minSize={112}
                maxSize={260}
                groupResizeBehavior="preserve-pixel-size"
              >
                <FunctionPanel
                  mediaItems={project.assets}
                  addedMediaIds={addedMediaIds}
                  onImportMedia={importMediaFiles}
                  onAddMedia={handleAddMedia}
                />
              </Panel>
              <Separator
                id="function-panel-resize-handle"
                className="studio-workspace__column-resize-handle"
                aria-label="调整功能区宽度"
              />
              <Panel id="player-panel" minSize={260}>
                <PlayerPanel
                  activeAsset={activeAsset}
                  activeClip={activeClip}
                  activeTrack={activeTrack}
                  playhead={project.playhead}
                  selectedRatio={project.aspectRatio}
                  onPlayheadChange={handleSetPlayhead}
                  onAspectRatioChange={handleAspectRatioChange}
                  onMediaError={reportMediaError}
                />
              </Panel>
              <Separator
                id="parameter-panel-resize-handle"
                className="studio-workspace__column-resize-handle"
                aria-label="调整参数区宽度"
              />
              <Panel
                id="parameter-panel"
                defaultSize={220}
                minSize={180}
                maxSize={340}
                groupResizeBehavior="preserve-pixel-size"
              >
                <ParameterPanel
                  clip={activeClip}
                  asset={activeAsset}
                  onUpdateClip={handleUpdateClip}
                />
              </Panel>
            </Group>
          </div>
        </Panel>

        <Separator
          id="workspace-timeline-resize-handle"
          className="studio-workspace__row-resize-handle"
          aria-label="调整时间线高度"
        />
        <Panel id="workspace-timeline" defaultSize="36" minSize={210} maxSize="62">
          <div className="studio-workspace__timeline">
            <Timeline
              clips={project.clips}
              assets={project.assets}
              tracks={project.tracks}
              playhead={project.playhead}
              zoom={project.timelineZoom}
              activeClipId={project.activeClipId}
              canUndo={history.past.length > 0}
              canRedo={history.future.length > 0}
              onSelectClip={handleSelectClip}
              onSetPlayhead={handleSetPlayhead}
              onMoveClip={(clipId, timelineStart, trackId) =>
                execute({ type: 'clip/move', clipId, timelineStart, trackId })
              }
              onTrimClip={(clipId, trim) => execute({ type: 'clip/trim', clipId, ...trim })}
              onSplitClip={(clipId, at) =>
                execute({ type: 'clip/split', clipId, at, rightClipId: crypto.randomUUID() })
              }
              onDeleteClip={(clipId) => execute({ type: 'clip/delete', clipId })}
              onUpdateTrack={handleUpdateTrack}
              onZoomChange={(zoom) =>
                dispatchProjectAction({ type: 'timeline/zoomChanged', zoom })
              }
              onUndo={undo}
              onRedo={redo}
            />
          </div>
        </Panel>
      </Group>
    </section>
  )
}

export default VideoEditorWorkspace
