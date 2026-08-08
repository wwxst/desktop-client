import type { CSSProperties, JSX, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Film, ListVideo, Pause, Play } from 'lucide-react'
import CompositionPreview from './CompositionPreview'
import {
  getProjectDuration,
  selectCompositionAtTime,
  type CanvasAspectRatio,
  type EditorProjectState,
  type EditorTrack,
  type MediaAsset,
  type ResolvedTimelineClip
} from './editorProject'

interface VideoPlaybackProps {
  project?: EditorProjectState
  activeAsset?: MediaAsset | null
  selectedRatio: CanvasAspectRatio
  rightControls: ReactNode
  onMediaError: (mediaId: string) => void
  activeClip?: ResolvedTimelineClip | null
  activeTrack?: EditorTrack | null
  playhead?: number
  onPlayheadChange?: (time: number) => void
}

interface CanvasStyle extends CSSProperties {
  '--canvas-aspect-ratio': string
  '--canvas-ratio-value': number
}

const getWholeSeconds = (seconds: number): number =>
  Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0

const formatPlaybackTime = (seconds: number): string => {
  const totalSeconds = getWholeSeconds(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60
  return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function VideoPlayback(props: VideoPlaybackProps): JSX.Element {
  if (props.project) return <CompositionVideoPlayback {...props} project={props.project} />
  return <LegacyVideoPlayback {...props} />
}

function CompositionVideoPlayback({
  project,
  selectedRatio,
  rightControls,
  onPlayheadChange,
  onMediaError,
  playhead = 0
}: VideoPlaybackProps & { project: EditorProjectState }): JSX.Element {
  const [isPlaying, setIsPlaying] = useState(false)
  const playheadRef = useRef(playhead)
  const projectDuration = getProjectDuration(project)
  const composition = selectCompositionAtTime(project, playhead)
  const hasPlayableMedia = project.clips.some((clip) =>
    project.assets.some((asset) => asset.id === clip.assetId && asset.status === 'ready')
  )
  const canPlay = hasPlayableMedia && projectDuration > 0
  const isPlaybackActive = isPlaying && canPlay
  const canvasStyle: CanvasStyle = {
    '--canvas-aspect-ratio': `${selectedRatio.width} / ${selectedRatio.height}`,
    '--canvas-ratio-value': selectedRatio.width / selectedRatio.height
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

  const togglePlayback = (): void => {
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
  }

  const hasVisibleLayers = composition.videoLayers.length > 0 || composition.audioLayers.length > 0

  return (
    <>
      <div className="studio-player__stage">
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
            />
          ) : (
            <Film size={34} strokeWidth={1.4} aria-hidden="true" />
          )}
        </div>
      </div>
      <footer className="studio-player__controls" aria-label="播放控制">
        <div className="studio-player__controls-left">
          <time
            className="studio-player__current-time"
            dateTime={`PT${getWholeSeconds(playhead)}S`}
          >
            {formatPlaybackTime(playhead)}
          </time>
          <span className="studio-player__time-divider" aria-hidden="true">
            /
          </span>
          <time dateTime={`PT${getWholeSeconds(projectDuration)}S`}>
            {formatPlaybackTime(projectDuration)}
          </time>
          <button type="button" aria-label="片段列表" title="片段列表" disabled>
            <ListVideo size={17} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <button
          className="studio-player__play"
          type="button"
          aria-label={isPlaybackActive ? '暂停' : '播放'}
          title={isPlaybackActive ? '暂停' : '播放'}
          disabled={!canPlay}
          onClick={togglePlayback}
        >
          {isPlaybackActive ? (
            <Pause size={18} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Play size={18} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
          )}
        </button>
        <div className="studio-player__controls-right">{rightControls}</div>
      </footer>
    </>
  )
}

function LegacyVideoPlayback({
  activeAsset = null,
  activeClip = null,
  activeTrack = null,
  playhead = 0,
  selectedRatio,
  rightControls,
  onPlayheadChange,
  onMediaError
}: VideoPlaybackProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [readyVideoKey, setReadyVideoKey] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [legacyCurrentTime, setLegacyCurrentTime] = useState(0)
  const [legacyDuration, setLegacyDuration] = useState(0)
  const isActiveAssetReady = activeAsset?.status === 'ready'
  const isTrackHidden = activeTrack?.hidden === true
  const isTrackMuted = activeTrack?.muted === true
  const videoKey = activeAsset
    ? `${activeAsset.id}:${activeAsset.status}:${isTrackHidden ? 'hidden' : 'visible'}`
    : null
  const isVideoReady = videoKey !== null && readyVideoKey === videoKey
  const canRenderVideo = Boolean(activeAsset && isActiveAssetReady && !isTrackHidden)
  const isPlaybackActive = isPlaying && canRenderVideo
  const canvasStyle: CanvasStyle = {
    '--canvas-aspect-ratio': `${selectedRatio.width} / ${selectedRatio.height}`,
    '--canvas-ratio-value': selectedRatio.width / selectedRatio.height
  }

  const clipTransformStyle = useMemo<CSSProperties | undefined>(() => {
    if (!activeClip) return undefined
    const { transform, opacity } = activeClip
    return {
      opacity,
      transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scaleX}, ${transform.scaleY}) rotate(${transform.rotation}deg)`
    }
  }, [activeClip])

  const displayCurrentTime = activeClip ? playhead : legacyCurrentTime
  const displayDuration = activeClip
    ? activeClip.timelineStart + activeClip.duration
    : legacyDuration

  useEffect(() => {
    const video = videoRef.current
    if (video) {
      video.pause()
      if (video.readyState > 0) video.currentTime = 0
    }
    return () => {
      if (video) {
        video.pause()
        if (video.readyState > 0) video.currentTime = 0
      }
    }
  }, [activeAsset?.id, activeClip?.id, activeTrack?.hidden])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeClip || !isVideoReady || isPlaying) return
    const clipStart = activeClip.timelineStart
    const clipEnd = clipStart + activeClip.duration
    const boundedProjectTime = clamp(playhead, clipStart, clipEnd)
    const sourceTime = clamp(
      activeClip.sourceStart + (boundedProjectTime - clipStart) * activeClip.speed,
      activeClip.sourceStart,
      activeClip.sourceEnd
    )
    if (Math.abs(video.currentTime - sourceTime) > 0.04) video.currentTime = sourceTime
  }, [activeClip, isPlaying, isVideoReady, playhead])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = activeClip?.speed ?? 1
    video.muted = isTrackMuted || Boolean(activeClip?.muted)
    video.volume = isTrackMuted ? 0 : clamp(activeClip?.volume ?? 1, 0, 1)
  }, [activeClip, isTrackMuted])

  const togglePlayback = async (): Promise<void> => {
    const video = videoRef.current
    if (!video || !activeAsset || !isActiveAssetReady || !isVideoReady || !canRenderVideo) return
    if (!video.paused) {
      video.pause()
      return
    }
    if (activeClip) {
      const clipEnd = activeClip.timelineStart + activeClip.duration
      if (playhead < activeClip.timelineStart || playhead >= clipEnd) {
        video.currentTime = activeClip.sourceStart
        onPlayheadChange?.(activeClip.timelineStart)
      }
      video.playbackRate = activeClip.speed
    }
    try {
      await video.play()
    } catch {
      if (videoRef.current === video) setIsPlaying(false)
    }
  }

  return (
    <>
      <div className="studio-player__stage">
        <div
          className="studio-player__canvas"
          style={canvasStyle}
          role={activeAsset ? undefined : 'img'}
          aria-label={
            activeAsset
              ? `${activeAsset.name} 播放器画布，${isTrackHidden ? '轨道已隐藏，' : ''}画面比例 ${selectedRatio.label}`
              : `暂无预览内容，画面比例 ${selectedRatio.label}`
          }
        >
          {activeAsset && isActiveAssetReady && !isTrackHidden ? (
            <video
              key={videoKey ?? activeAsset.id}
              ref={videoRef}
              src={activeAsset.url}
              style={clipTransformStyle}
              preload="auto"
              playsInline
              aria-label={`${activeAsset.name}播放器预览`}
              onLoadedData={(event) => {
                const video = event.currentTarget
                if (activeClip) {
                  video.currentTime = activeClip.sourceStart
                  video.playbackRate = activeClip.speed
                  video.muted = isTrackMuted || activeClip.muted
                  video.volume = isTrackMuted ? 0 : clamp(activeClip.volume, 0, 1)
                } else {
                  video.currentTime = 0
                  setLegacyCurrentTime(0)
                  setLegacyDuration(video.duration)
                }
                if (videoKey) setReadyVideoKey(videoKey)
              }}
              onTimeUpdate={(event) => {
                const video = event.currentTarget
                if (!activeClip) {
                  setLegacyCurrentTime(video.currentTime)
                  return
                }
                if (video.currentTime >= activeClip.sourceEnd - 0.01) {
                  video.pause()
                  video.currentTime = activeClip.sourceEnd
                  onPlayheadChange?.(activeClip.timelineStart + activeClip.duration)
                  return
                }
                const projectTime =
                  activeClip.timelineStart +
                  (video.currentTime - activeClip.sourceStart) / activeClip.speed
                onPlayheadChange?.(
                  clamp(
                    projectTime,
                    activeClip.timelineStart,
                    activeClip.timelineStart + activeClip.duration
                  )
                )
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onError={() => {
                setReadyVideoKey(null)
                setIsPlaying(false)
                onMediaError(activeAsset.id)
              }}
            />
          ) : (
            <Film size={34} strokeWidth={1.4} aria-hidden="true" />
          )}
        </div>
      </div>
      <footer className="studio-player__controls" aria-label="播放控制">
        <div className="studio-player__controls-left">
          <time
            className="studio-player__current-time"
            dateTime={`PT${getWholeSeconds(displayCurrentTime)}S`}
          >
            {formatPlaybackTime(displayCurrentTime)}
          </time>
          <span className="studio-player__time-divider" aria-hidden="true">
            /
          </span>
          <time dateTime={`PT${getWholeSeconds(displayDuration)}S`}>
            {formatPlaybackTime(displayDuration)}
          </time>
          <button type="button" aria-label="片段列表" title="片段列表" disabled>
            <ListVideo size={17} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <button
          className="studio-player__play"
          type="button"
          aria-label={isPlaybackActive ? '暂停' : '播放'}
          title={isPlaybackActive ? '暂停' : '播放'}
          disabled={!isActiveAssetReady || !isVideoReady || isTrackHidden}
          onClick={() => void togglePlayback()}
        >
          {isPlaybackActive ? (
            <Pause size={18} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Play size={18} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
          )}
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
