import type { JSX } from 'react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import FunctionPanel from './FunctionPanel'
import ParameterPanel from './ParameterPanel'
import PlayerPanel from './PlayerPanel'
import Timeline from './Timeline'
import { createEditorAgentApi, registerEditorAgentApi } from './editorAgentApi'
import { createClipboardSnapshot, type EditorClipboardSnapshot } from './editorClipboard'
import type { ClipPatch, EditorCommand } from './editorCommands'
import {
  applyEditorCommand,
  applyEditorCommandsWithResult,
  applyEditorTransactionWithResult,
  type EditorBatchCommandResult,
  type EditorCommandResult
} from './editorCommands'
import { createInitialEditorHistoryState, editorHistoryReducer } from './editorHistory'
import { isTextEditingTarget } from './editorInteraction'
import { createEditorService } from './core/editorService'
import { createEditorInteractionController } from './interaction/editorInteractionController'
import { createEditorPlaybackController } from './playback/editorPlaybackController'
import {
  getMainVisualTrack,
  getProjectDuration,
  getTrackEnd,
  resolveTimelineClip,
  selectActiveAsset,
  selectActiveClip,
  type CanvasAspectRatio,
  type EditorProjectAction,
  type EditorTrack
} from './editorProject'
import { useMediaLibrary } from './useMediaLibrary'
import './VideoEditorWorkspace.css'

interface PendingExternalDrop {
  id: string
  assetIds: string[]
  timelineStart: number
  trackId?: string
  newVisualLayer?: boolean
}

const FRAME_STEP = 1 / 30

function VideoEditorWorkspace(): JSX.Element {
  const [history, dispatch] = useReducer(editorHistoryReducer, undefined, () =>
    createInitialEditorHistoryState(crypto.randomUUID())
  )
  const project = history.present
  const [selectedClipIdsState, setSelectedClipIds] = useState<string[]>([])
  const selectedClipIds = useMemo(
    () => selectedClipIdsState.filter((id) => project.clips.some((clip) => clip.id === id)),
    [project.clips, selectedClipIdsState]
  )
  const [clipboard, setClipboard] = useState<EditorClipboardSnapshot | null>(null)
  const [snappingEnabled, setSnappingEnabled] = useState(true)
  const [magnetEnabled, setMagnetEnabled] = useState(false)
  const [playbackController] = useState(() => createEditorPlaybackController(0))
  const [interactionController] = useState(() => createEditorInteractionController())
  const [editorSessionId] = useState(() => crypto.randomUUID())
  const pendingExternalDropsRef = useRef<PendingExternalDrop[]>([])
  const rowLayout = useDefaultLayout({
    groupId: 'desktop-client-editor-v2-rows',
    storage: localStorage
  })
  const columnLayout = useDefaultLayout({
    groupId: 'desktop-client-editor-v2-columns-expanded',
    storage: localStorage
  })

  const dispatchProjectAction = useCallback((action: EditorProjectAction): void => {
    dispatch({ type: 'project/action', action })
  }, [])

  const execute = useCallback(
    (command: EditorCommand): EditorCommandResult => {
      const result = applyEditorCommand(project, command)
      if (result.changed) dispatch({ type: 'command/execute', command })
      return result
    },
    [project]
  )

  const executeBatch = useCallback(
    (commands: readonly EditorCommand[]): EditorBatchCommandResult => {
      const result = applyEditorCommandsWithResult(project, commands)
      if (result.changed) dispatch({ type: 'command/batch', commands })
      return result
    },
    [project]
  )

  const executeTransaction = useCallback(
    (commands: readonly EditorCommand[], label?: string): EditorBatchCommandResult => {
      const result = applyEditorTransactionWithResult(project, commands)
      if (result.success && result.changed)
        dispatch({ type: 'command/transaction', commands, label })
      return result
    },
    [project]
  )

  const undo = useCallback((): void => dispatch({ type: 'history/undo' }), [])
  const redo = useCallback((): void => dispatch({ type: 'history/redo' }), [])
  const { importMediaFiles, reportMediaError } = useMediaLibrary(dispatchProjectAction)
  const activeAsset = selectActiveAsset(project)
  const activeClip = selectActiveClip(project)
  const activeTrack = activeClip
    ? (project.tracks.find((track) => track.id === activeClip.trackId) ?? null)
    : null

  const setSelection = useCallback(
    (clipIds: readonly string[], activeId?: string | null): void => {
      const unique = [...new Set(clipIds)].filter((id) =>
        project.clips.some((clip) => clip.id === id)
      )
      setSelectedClipIds(unique)
      const nextActive = activeId === undefined ? (unique.at(-1) ?? null) : activeId
      dispatchProjectAction({
        type: 'timeline/clipSelected',
        clipId: nextActive && unique.includes(nextActive) ? nextActive : (unique.at(-1) ?? null)
      })
    },
    [dispatchProjectAction, project.clips]
  )

  const handleSelectClip = useCallback(
    (clipId: string): void => setSelection([clipId], clipId),
    [setSelection]
  )

  const handleSetPlayhead = useCallback(
    (time: number): void => playbackController.seek(time),
    [playbackController]
  )

  useEffect(() => {
    playbackController.setDuration(getProjectDuration(project))
  }, [playbackController, project])

  useEffect(() => () => playbackController.dispose(), [playbackController])

  const editorService = useMemo(
    () =>
      createEditorService({
        getProject: () => project,
        executeTransaction
      }),
    [executeTransaction, project]
  )

  const handleAspectRatioChange = useCallback(
    (aspectRatio: CanvasAspectRatio): void => {
      execute({ type: 'canvas/setAspectRatio', aspectRatio })
    },
    [execute]
  )

  const handleUpdateClip = useCallback(
    (patch: ClipPatch): void => {
      if (!activeClip) return
      execute({ type: 'clip/update', clipId: activeClip.id, patch })
    },
    [activeClip, execute]
  )

  const handleUpdateTrack = useCallback(
    (
      trackId: string,
      patch: Partial<Pick<EditorTrack, 'locked' | 'hidden' | 'muted' | 'name'>>
    ): void => {
      execute({ type: 'track/update', trackId, patch })
    },
    [execute]
  )

  const handleAddMedia = useCallback(
    (assetId: string): void => {
      const mainTrack = getMainVisualTrack(project)
      const timelineStart = mainTrack
        ? getTrackEnd(project, mainTrack.id)
        : getProjectDuration(project)
      editorService.placeAsset({ assetId, timelineStart, trackId: mainTrack?.id })
    },
    [editorService, project]
  )

  const handleAddMediaAt = useCallback(
    (assetId: string, timelineStart: number, trackId?: string): void => {
      editorService.placeAsset({ assetId, timelineStart, trackId })
    },
    [editorService]
  )

  const handleAddMediaToNewLayer = useCallback(
    (assetId: string, timelineStart: number): void => {
      editorService.placeAsset({ assetId, timelineStart, forceNewLayer: true })
    },
    [editorService]
  )

  const handleMoveClipToNewLayer = useCallback(
    (clipId: string, timelineStart: number): void => {
      editorService.moveClips([{ clipId, timelineStart, forceNewLayer: true }])
    },
    [editorService]
  )

  const handleMoveClips = useCallback(
    (moves: readonly { clipId: string; timelineStart: number; trackId?: string }[]): void => {
      editorService.moveClips(moves)
    },
    [editorService]
  )

  const handleDeleteClips = useCallback(
    (clipIds: readonly string[]): void => {
      if (clipIds.length === 0) return
      const result = editorService.deleteClips(clipIds, { magnetMainTrack: magnetEnabled })
      if (result.success && result.changed) setSelection([], null)
    },
    [editorService, magnetEnabled, setSelection]
  )

  const handleCopyClips = useCallback(
    (clipIds: readonly string[]): void => setClipboard(createClipboardSnapshot(project, clipIds)),
    [project]
  )

  const handleCutClips = useCallback(
    (clipIds: readonly string[]): void => {
      const snapshot = createClipboardSnapshot(project, clipIds)
      if (!snapshot) return
      setClipboard(snapshot)
      handleDeleteClips(clipIds)
    },
    [handleDeleteClips, project]
  )

  const handlePaste = useCallback(
    (at?: number): void => {
      if (!clipboard) return
      const pasteAt = at ?? playbackController.getSnapshot().playhead
      const { result, newIds } = editorService.paste(clipboard, pasteAt)
      if (result.success && result.changed) setSelection(newIds, newIds.at(-1) ?? null)
    },
    [clipboard, editorService, playbackController, setSelection]
  )

  const handleDuplicateClips = useCallback(
    (clipIds: readonly string[]): void => {
      const snapshot = createClipboardSnapshot(project, clipIds)
      if (!snapshot) return
      const maxEnd = snapshot.items.reduce((end, item) => {
        const asset = project.assets.find((candidate) => candidate.id === item.clip.assetId) ?? null
        const clip = resolveTimelineClip(item.clip, asset)
        return Math.max(end, clip.timelineStart + clip.duration)
      }, snapshot.sourceAnchor)
      const { result, newIds } = editorService.paste(snapshot, maxEnd)
      if (result.success && result.changed) setSelection(newIds, newIds.at(-1) ?? null)
    },
    [editorService, project, setSelection]
  )

  const handleExternalFilesDrop = useCallback(
    (
      files: readonly File[],
      placement: { timelineStart: number; trackId?: string; newVisualLayer?: boolean }
    ): void => {
      const assetIds = importMediaFiles(files)
      if (assetIds.length === 0) return
      pendingExternalDropsRef.current.push({ id: crypto.randomUUID(), assetIds, ...placement })
    },
    [importMediaFiles]
  )

  useEffect(() => {
    if (pendingExternalDropsRef.current.length === 0) return
    const remaining: PendingExternalDrop[] = []
    for (const pending of pendingExternalDropsRef.current) {
      const assets = pending.assetIds
        .map((id) => project.assets.find((asset) => asset.id === id))
        .filter((asset) => asset !== undefined)
      if (
        assets.length !== pending.assetIds.length ||
        assets.some((asset) => asset.status === 'loading')
      ) {
        remaining.push(pending)
        continue
      }
      const ready = assets.filter((asset) => asset.status === 'ready' && (asset.duration ?? 0) > 0)
      if (ready.length === 0) continue

      editorService.placeAssetsSequential({
        assetIds: ready.map((asset) => asset.id),
        timelineStart: pending.timelineStart,
        trackId: pending.trackId,
        forceNewLayer: pending.newVisualLayer
      })
    }
    pendingExternalDropsRef.current = remaining
  }, [editorService, project.assets])

  const agentApi = useMemo(
    () =>
      createEditorAgentApi({
        getProject: () => project,
        getSessionId: () => editorSessionId,
        getRevision: () => history.revision,
        getSelection: () => selectedClipIds,
        getPlayhead: () => playbackController.getSnapshot().playhead,
        execute,
        executeBatch,
        executeTransaction,
        service: editorService,
        undo,
        redo
      }),
    [
      editorService,
      editorSessionId,
      execute,
      executeBatch,
      executeTransaction,
      history.revision,
      playbackController,
      project,
      redo,
      selectedClipIds,
      undo
    ]
  )

  useEffect(() => registerEditorAgentApi(agentApi), [agentApi])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isTextEditingTarget(event.target)) return
      const modifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()

      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault()
        interactionController.setSpacePressed(true)
        return
      }

      if (modifier && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (modifier && key === 'c') {
        event.preventDefault()
        handleCopyClips(selectedClipIds)
        return
      }
      if (modifier && key === 'x') {
        event.preventDefault()
        handleCutClips(selectedClipIds)
        return
      }
      if (modifier && key === 'v') {
        event.preventDefault()
        handlePaste()
        return
      }
      if (modifier && key === 'd') {
        event.preventDefault()
        handleDuplicateClips(selectedClipIds)
        return
      }
      if (modifier && key === 'b' && activeClip) {
        event.preventDefault()
        editorService.splitClip(activeClip.id, playbackController.getSnapshot().playhead)
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedClipIds.length === 0) return
        event.preventDefault()
        handleDeleteClips(selectedClipIds)
        return
      }
      if (event.key === 'Escape') {
        setSelection([], null)
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const delta = event.key === 'ArrowLeft' ? -FRAME_STEP : FRAME_STEP
        playbackController.step(delta)
      }
    }

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code !== 'Space') return
      const snapshot = interactionController.getSnapshot()
      if (snapshot.spacePressed && !snapshot.spaceGestureUsed) playbackController.toggle()
      interactionController.setSpacePressed(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [
    activeClip,
    editorService,
    execute,
    interactionController,
    playbackController,
    handleCopyClips,
    handleCutClips,
    handleDeleteClips,
    handleDuplicateClips,
    handlePaste,
    handleSetPlayhead,
    project,
    redo,
    selectedClipIds,
    setSelection,
    undo
  ])

  return (
    <section className="studio-workspace" aria-label="剪辑工作区">
      <Group
        {...rowLayout}
        className="studio-workspace__rows"
        orientation="vertical"
        resizeTargetMinimumSize={{ fine: 8, coarse: 16 }}
      >
        <Panel id="workspace-top" defaultSize="64" minSize={280}>
          <div className="studio-workspace__top">
            <Group
              {...columnLayout}
              className="studio-workspace__columns"
              orientation="horizontal"
              resizeTargetMinimumSize={{ fine: 8, coarse: 16 }}
            >
              <Panel
                id="function-panel"
                className="studio-workspace__card studio-workspace__card--function"
                defaultSize={360}
                minSize={126}
                maxSize={360}
                groupResizeBehavior="preserve-pixel-size"
              >
                <FunctionPanel
                  mediaItems={project.assets}
                  onImportMedia={importMediaFiles}
                  onAddMedia={handleAddMedia}
                />
              </Panel>
              <Separator
                id="function-panel-resize-handle"
                className="studio-workspace__column-resize-handle"
                aria-label="调整素材区宽度"
              />
              <Panel
                id="player-panel"
                className="studio-workspace__card studio-workspace__card--player"
                minSize={240}
              >
                <PlayerPanel
                  project={project}
                  playbackController={playbackController}
                  interactionController={interactionController}
                  activeAsset={activeAsset}
                  activeClip={activeClip}
                  activeTrack={activeTrack}
                  playhead={playbackController.getSnapshot().playhead}
                  selectedRatio={project.aspectRatio}
                  onPlayheadChange={handleSetPlayhead}
                  onAspectRatioChange={handleAspectRatioChange}
                  onMediaError={reportMediaError}
                  onSelectClip={handleSelectClip}
                  onUpdateClip={handleUpdateClip}
                  onUpdateClipById={(clipId, patch) =>
                    editorService.updateClip(clipId, patch, '画布变换')
                  }
                  onDeleteClip={(clipId) => handleDeleteClips([clipId])}
                  onCutClip={(clipId) => handleCutClips([clipId])}
                  onCopyClip={(clipId) => handleCopyClips([clipId])}
                  onDuplicateClip={(clipId) => handleDuplicateClips([clipId])}
                  onToggleClipMuted={(clipId) => {
                    const clip = project.clips.find((item) => item.id === clipId)
                    const asset = clip
                      ? (project.assets.find((item) => item.id === clip.assetId) ?? null)
                      : null
                    if (!clip) return
                    const resolved = resolveTimelineClip(clip, asset)
                    execute({ type: 'clip/update', clipId, patch: { muted: !resolved.muted } })
                  }}
                  onToggleClipEnabled={(clipId) => {
                    const clip = project.clips.find((item) => item.id === clipId)
                    const asset = clip
                      ? (project.assets.find((item) => item.id === clip.assetId) ?? null)
                      : null
                    if (!clip) return
                    const resolved = resolveTimelineClip(clip, asset)
                    execute({ type: 'clip/update', clipId, patch: { enabled: !resolved.enabled } })
                  }}
                  onResetClipTransform={(clipId) =>
                    execute({
                      type: 'clip/update',
                      clipId,
                      patch: {
                        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
                        opacity: 1
                      }
                    })
                  }
                />
              </Panel>
              <Separator
                id="parameter-panel-resize-handle"
                className="studio-workspace__column-resize-handle"
                aria-label="调整属性区宽度"
              />
              <Panel
                id="parameter-panel"
                className="studio-workspace__card studio-workspace__card--parameter"
                defaultSize={420}
                minSize={198}
                maxSize={420}
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
        <Panel id="workspace-timeline" defaultSize="36" minSize={220} maxSize="72">
          <div className="studio-workspace__timeline studio-workspace__card studio-workspace__card--timeline">
            <Timeline
              clips={project.clips}
              assets={project.assets}
              tracks={project.tracks}
              playhead={playbackController.getSnapshot().playhead}
              playbackController={playbackController}
              interactionController={interactionController}
              zoom={project.timelineZoom}
              activeClipId={project.activeClipId}
              selectedClipIds={selectedClipIds}
              canUndo={history.past.length > 0}
              canRedo={history.future.length > 0}
              canPaste={Boolean(clipboard)}
              snappingEnabled={snappingEnabled}
              onSnappingChange={setSnappingEnabled}
              magnetEnabled={magnetEnabled}
              onMagnetChange={setMagnetEnabled}
              onSelectClip={handleSelectClip}
              onSelectionChange={setSelection}
              onSetPlayhead={handleSetPlayhead}
              onMoveClip={(clipId, timelineStart, trackId) =>
                editorService.moveClips([{ clipId, timelineStart, trackId }])
              }
              onMoveClips={handleMoveClips}
              onMoveClipToNewLayer={handleMoveClipToNewLayer}
              onTrimClip={(clipId, trim) => execute({ type: 'clip/trim', clipId, ...trim })}
              onSplitClip={(clipId, at) => editorService.splitClip(clipId, at)}
              onDeleteClip={(clipId) => handleDeleteClips([clipId])}
              onDeleteClips={handleDeleteClips}
              onAddMediaAt={handleAddMediaAt}
              onAddMediaToNewLayer={handleAddMediaToNewLayer}
              onExternalFilesDrop={handleExternalFilesDrop}
              onCopyClips={handleCopyClips}
              onCutClips={handleCutClips}
              onPaste={handlePaste}
              onDuplicateClips={handleDuplicateClips}
              onToggleClipMute={(clipId) => {
                const clip = project.clips.find((item) => item.id === clipId)
                const asset = clip
                  ? (project.assets.find((item) => item.id === clip.assetId) ?? null)
                  : null
                if (!clip) return
                const resolved = resolveTimelineClip(clip, asset)
                execute({ type: 'clip/update', clipId, patch: { muted: !resolved.muted } })
              }}
              onToggleClipEnabled={(clipId) => {
                const clip = project.clips.find((item) => item.id === clipId)
                const asset = clip
                  ? (project.assets.find((item) => item.id === clip.assetId) ?? null)
                  : null
                if (!clip) return
                const resolved = resolveTimelineClip(clip, asset)
                execute({ type: 'clip/update', clipId, patch: { enabled: !resolved.enabled } })
              }}
              onResetClipTransform={(clipId) =>
                execute({
                  type: 'clip/update',
                  clipId,
                  patch: {
                    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
                    opacity: 1
                  }
                })
              }
              onUpdateTrack={handleUpdateTrack}
              onZoomChange={(zoom) => dispatchProjectAction({ type: 'timeline/zoomChanged', zoom })}
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
