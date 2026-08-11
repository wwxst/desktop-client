import type { CSSProperties, JSX, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Film, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import CompositionPreview from './CompositionPreview'
import type { ClipPatch } from './editorCommands'
import { isTextEditingTarget } from './editorInteraction'
import {
  getProjectDuration,
  selectCompositionAtTime,
  type CanvasAspectRatio,
  type EditorProjectState,
  type EditorTrack,
  type MediaAsset,
  type ResolvedTimelineClip
} from './editorProject'
import { formatTimecode } from './editorTime'
import type { EditorPlaybackController } from './playback/editorPlaybackController'
import { useEditorPlayback } from './playback/useEditorPlayback'
import type { EditorInteractionController } from './interaction/editorInteractionController'

interface VideoPlaybackProps {
  project?: EditorProjectState
  playbackController?: EditorPlaybackController
  interactionController?: EditorInteractionController
  activeAsset?: MediaAsset | null
  selectedRatio: CanvasAspectRatio
  rightControls: ReactNode
  onMediaError: (mediaId: string) => void
  activeClip?: ResolvedTimelineClip | null
  activeTrack?: EditorTrack | null
  playhead?: number
  onPlayheadChange?: (time: number) => void
  onSelectClip?: (clipId: string) => void
  onUpdateClip?: (patch: ClipPatch) => void
  onUpdateClipById?: (clipId: string, patch: ClipPatch) => void
  onDeleteClip?: (clipId: string) => void
  onCutClip?: (clipId: string) => void
  onCopyClip?: (clipId: string) => void
  onDuplicateClip?: (clipId: string) => void
  onToggleClipMuted?: (clipId: string) => void
  onToggleClipEnabled?: (clipId: string) => void
  onResetClipTransform?: (clipId: string) => void
  onPreviewPanChange?: (pan: { x: number; y: number }) => void
  previewPan?: { x: number; y: number }
}

interface CanvasStyle extends CSSProperties {
  '--canvas-aspect-ratio': string
  '--canvas-ratio-value': number
}

const FRAME_STEP = 1 / 30

function VideoPlayback(props: VideoPlaybackProps): JSX.Element {
  if (props.project && props.playbackController) {
    return (
      <ControlledCompositionVideoPlayback
        {...props}
        project={props.project}
        playbackController={props.playbackController}
      />
    )
  }
  if (props.project) return <CompositionVideoPlayback {...props} project={props.project} />
  return <LegacyVideoPlayback {...props} />
}

function ControlledCompositionVideoPlayback({
  project,
  playbackController,
  interactionController,
  selectedRatio,
  rightControls,
  onMediaError,
  onSelectClip,
  onUpdateClip,
  onUpdateClipById,
  onDeleteClip,
  onCutClip,
  onCopyClip,
  onDuplicateClip,
  onToggleClipMuted,
  onToggleClipEnabled,
  onResetClipTransform,
  previewPan = { x: 0, y: 0 },
  onPreviewPanChange
}: VideoPlaybackProps & { project: EditorProjectState; playbackController: EditorPlaybackController }): JSX.Element {
  const playback = useEditorPlayback(playbackController)
  const panRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startPanX: number
    startPanY: number
  } | null>(null)
  const projectDuration = getProjectDuration(project)
  const composition = selectCompositionAtTime(project, playback.playhead)
  const hasPlayableMedia = project.clips.some((clip) =>
    project.assets.some((asset) => asset.id === clip.assetId && asset.status === 'ready')
  )
  const canPlay = hasPlayableMedia && projectDuration > 0
  const canvasStyle: CanvasStyle = {
    '--canvas-aspect-ratio': `${selectedRatio.width} / ${selectedRatio.height}`,
    '--canvas-ratio-value': selectedRatio.width / selectedRatio.height,
    transform: `translate(${previewPan.x}px, ${previewPan.y}px)`
  }

  useEffect(() => playbackController.setDuration(projectDuration), [playbackController, projectDuration])

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      const pan = panRef.current
      if (!pan || event.pointerId !== pan.pointerId) return
      interactionController?.markSpaceGestureUsed()
      onPreviewPanChange?.({
        x: pan.startPanX + event.clientX - pan.startX,
        y: pan.startPanY + event.clientY - pan.startY
      })
    }
    const stop = (event: PointerEvent): void => {
      if (panRef.current?.pointerId !== event.pointerId) return
      panRef.current = null
      interactionController?.end('panning-canvas')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [interactionController, onPreviewPanChange])

  const hasVisibleLayers = composition.videoLayers.length > 0 || composition.audioLayers.length > 0
  const startPan = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const useSpacePan = event.button === 0 && interactionController?.getSnapshot().spacePressed
    if (event.button !== 1 && !useSpacePan) return
    if (interactionController && !interactionController.begin('panning-canvas', event.pointerId)) return
    if (useSpacePan) interactionController.markSpaceGestureUsed()
    event.preventDefault()
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPanX: previewPan.x,
      startPanY: previewPan.y
    }
  }

  return (
    <>
      <div className="studio-player__stage" onPointerDown={startPan}>
        <div
          className={`studio-player__canvas${hasVisibleLayers ? ' studio-player__canvas--composition' : ''}`}
          style={canvasStyle}
          role={hasVisibleLayers ? undefined : 'img'}
          aria-label={hasVisibleLayers ? `工程合成预览画布，画面比例 ${selectedRatio.label}` : `暂无预览内容，画面比例 ${selectedRatio.label}`}
        >
          {hasVisibleLayers ? (
            <CompositionPreview
              project={project}
              composition={composition}
              playhead={playback.playhead}
              isPlaying={playback.isPlaying}
              interactionController={interactionController}
              onMediaError={onMediaError}
              activeClipId={project.activeClipId}
              onSelectClip={onSelectClip}
              onUpdateClip={onUpdateClip}
              onUpdateClipById={onUpdateClipById}
              onDeleteClip={onDeleteClip}
              onCutClip={onCutClip}
              onCopyClip={onCopyClip}
              onDuplicateClip={onDuplicateClip}
              onToggleClipMuted={onToggleClipMuted}
              onToggleClipEnabled={onToggleClipEnabled}
              onResetClipTransform={onResetClipTransform}
            />
          ) : (
            <div className="studio-player__empty">
              <Film size={30} strokeWidth={1.4} aria-hidden="true" />
              <strong>把视频拖到时间线开始剪辑</strong>
              <span>预览区会跟随播放头实时显示工程画面</span>
            </div>
          )}
        </div>
      </div>
      <footer className="studio-player__controls" aria-label="播放控制">
        <div className="studio-player__controls-left">
          <time className="studio-player__current-time">{formatTimecode(playback.playhead)}</time>
          <span className="studio-player__time-divider" aria-hidden="true">/</span>
          <time>{formatTimecode(projectDuration)}</time>
        </div>
        <div className="studio-player__transport">
          <button type="button" aria-label="上一帧" title="上一帧 ←" disabled={!canPlay} onClick={() => playbackController.step(-FRAME_STEP)}>
            <SkipBack size={15} aria-hidden="true" />
          </button>
          <button className="studio-player__play" type="button" aria-label={playback.isPlaying ? '暂停' : '播放'} title={`${playback.isPlaying ? '暂停' : '播放'} Space`} disabled={!canPlay} onClick={() => playbackController.toggle()}>
            {playback.isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <button type="button" aria-label="下一帧" title="下一帧 →" disabled={!canPlay} onClick={() => playbackController.step(FRAME_STEP)}>
            <SkipForward size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="studio-player__controls-right">{rightControls}</div>
      </footer>
    </>
  )
}

function CompositionVideoPlayback({
  project,
  selectedRatio,
  rightControls,
  onPlayheadChange,
  onMediaError,
  onSelectClip,
  onUpdateClip,
  onDeleteClip,
  onCopyClip,
  onDuplicateClip,
  onToggleClipMuted,
  onToggleClipEnabled,
  onResetClipTransform,
  playhead = 0,
  previewPan = { x: 0, y: 0 },
  onPreviewPanChange
}: VideoPlaybackProps & { project: EditorProjectState }): JSX.Element {
  const [isPlaying, setIsPlaying] = useState(false)
  const playheadRef = useRef(playhead)
  const panRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startPanX: number
    startPanY: number
  } | null>(null)
  const projectDuration = getProjectDuration(project)
  const composition = selectCompositionAtTime(project, playhead)
  const hasPlayableMedia = project.clips.some((clip) =>
    project.assets.some((asset) => asset.id === clip.assetId && asset.status === 'ready')
  )
  const canPlay = hasPlayableMedia && projectDuration > 0
  const isPlaybackActive = isPlaying && canPlay
  const canvasStyle: CanvasStyle = {
    '--canvas-aspect-ratio': `${selectedRatio.width} / ${selectedRatio.height}`,
    '--canvas-ratio-value': selectedRatio.width / selectedRatio.height,
    transform: `translate(${previewPan.x}px, ${previewPan.y}px)`
  }

  useEffect(() => {
    playheadRef.current = playhead
  }, [playhead])

  useEffect(() => {
    if (!isPlaying || !canPlay) return
    let animationFrame = 0
    let lastTimestamp = performance.now()
    const tick = (timestamp: number): void => {
      const elapsed = Math.max(0, (timestamp - lastTimestamp) / 1000)
      lastTimestamp = timestamp
      const nextTime = Math.min(projectDuration, playheadRef.current + elapsed)
      playheadRef.current = nextTime
      onPlayheadChange?.(nextTime)
      if (nextTime >= projectDuration) {
        setIsPlaying(false)
        return
      }
      animationFrame = requestAnimationFrame(tick)
    }
    animationFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrame)
  }, [canPlay, isPlaying, onPlayheadChange, projectDuration])

  const togglePlayback = useCallback((): void => {
    if (!canPlay) return
    if (isPlaying) {
      setIsPlaying(false)
      return
    }
    if (playhead >= projectDuration) {
      playheadRef.current = 0
      onPlayheadChange?.(0)
    }
    setIsPlaying(true)
  }, [canPlay, isPlaying, onPlayheadChange, playhead, projectDuration])

  const stepFrame = useCallback(
    (direction: -1 | 1): void => {
      setIsPlaying(false)
      onPlayheadChange?.(clamp(playhead + FRAME_STEP * direction, 0, projectDuration))
    },
    [onPlayheadChange, playhead, projectDuration]
  )

  useEffect(() => {
    const keyDown = (event: KeyboardEvent): void => {
      if (isTextEditingTarget(event.target)) return
      if (event.code !== 'Space' || event.repeat) return
      event.preventDefault()
      togglePlayback()
    }
    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  }, [togglePlayback])

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      const pan = panRef.current
      if (!pan || event.pointerId !== pan.pointerId) return
      onPreviewPanChange?.({
        x: pan.startPanX + event.clientX - pan.startX,
        y: pan.startPanY + event.clientY - pan.startY
      })
    }
    const stop = (event: PointerEvent): void => {
      if (panRef.current?.pointerId !== event.pointerId) return
      panRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [onPreviewPanChange])

  const hasVisibleLayers = composition.videoLayers.length > 0 || composition.audioLayers.length > 0

  return (
    <>
      <div
        className="studio-player__stage"
        onPointerDown={(event) => {
          if (event.button !== 1) return
          event.preventDefault()
          panRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startPanX: previewPan.x,
            startPanY: previewPan.y
          }
        }}
      >
        <div
          className={`studio-player__canvas${hasVisibleLayers ? ' studio-player__canvas--composition' : ''}`}
          style={canvasStyle}
          role={hasVisibleLayers ? undefined : 'img'}
          aria-label={
            hasVisibleLayers
              ? `工程合成预览画布，画面比例 ${selectedRatio.label}`
              : `暂无预览内容，画面比例 ${selectedRatio.label}`
          }
        >
          {hasVisibleLayers ? (
            <CompositionPreview
              project={project}
              composition={composition}
              playhead={playhead}
              isPlaying={isPlaying}
              onMediaError={onMediaError}
              activeClipId={project.activeClipId}
              onSelectClip={onSelectClip}
              onUpdateClip={onUpdateClip}
              onDeleteClip={onDeleteClip}
              onCopyClip={onCopyClip}
              onDuplicateClip={onDuplicateClip}
              onToggleClipMuted={onToggleClipMuted}
              onToggleClipEnabled={onToggleClipEnabled}
              onResetClipTransform={onResetClipTransform}
            />
          ) : (
            <div className="studio-player__empty">
              <Film size={30} strokeWidth={1.4} aria-hidden="true" />
              <strong>把视频拖到时间线开始剪辑</strong>
              <span>预览区会跟随播放头实时显示工程画面</span>
            </div>
          )}
        </div>
      </div>
      <footer className="studio-player__controls" aria-label="播放控制">
        <div className="studio-player__controls-left">
          <time className="studio-player__current-time">{formatTimecode(playhead)}</time>
          <span className="studio-player__time-divider" aria-hidden="true">/</span>
          <time>{formatTimecode(projectDuration)}</time>
        </div>
        <div className="studio-player__transport">
          <button type="button" aria-label="上一帧" title="上一帧 ←" disabled={!canPlay} onClick={() => stepFrame(-1)}>
            <SkipBack size={15} aria-hidden="true" />
          </button>
          <button
            className="studio-player__play"
            type="button"
            aria-label={isPlaybackActive ? '暂停' : '播放'}
            title={`${isPlaybackActive ? '暂停' : '播放'} Space`}
            disabled={!canPlay}
            onClick={togglePlayback}
          >
            {isPlaybackActive ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <button type="button" aria-label="下一帧" title="下一帧 →" disabled={!canPlay} onClick={() => stepFrame(1)}>
            <SkipForward size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="studio-player__controls-right">{rightControls}</div>
      </footer>
    </>
  )
}

function LegacyVideoPlayback({
  activeAsset = null,
  activeTrack = null,
  selectedRatio,
  rightControls,
  onMediaError
}: VideoPlaybackProps): JSX.Element {
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasStyle: CanvasStyle = {
    '--canvas-aspect-ratio': `${selectedRatio.width} / ${selectedRatio.height}`,
    '--canvas-ratio-value': selectedRatio.width / selectedRatio.height
  }
  const canRender = activeAsset?.status === 'ready' && !activeTrack?.hidden

  return (
    <>
      <div className="studio-player__stage">
        <div
          className="studio-player__canvas"
          style={canvasStyle}
          aria-label={`${canRender ? '播放器画布' : '暂无预览内容'}，画面比例 ${selectedRatio.label}`}
        >
          {activeAsset && canRender ? (
            <video
              ref={videoRef}
              src={activeAsset.url}
              preload="auto"
              playsInline
              muted={activeTrack?.muted === true}
              aria-label={`${activeAsset.name}播放器预览`}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={() => onMediaError(activeAsset.id)}
            />
          ) : (
            <Film size={30} strokeWidth={1.4} aria-hidden="true" />
          )}
        </div>
      </div>
      <footer className="studio-player__controls" aria-label="播放控制">
        <div className="studio-player__controls-left">00:00.00</div>
        <button
          className="studio-player__play"
          type="button"
          aria-label={isPlaying ? '暂停' : '播放'}
          disabled={!canRender}
          onClick={() => {
            const video = videoRef.current
            if (!video) return
            if (video.paused) void video.play()
            else video.pause()
          }}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <div className="studio-player__controls-right">{rightControls}</div>
      </footer>
    </>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export default VideoPlayback
