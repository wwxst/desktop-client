import type { CSSProperties, JSX, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Film, ListVideo, Pause, Play } from 'lucide-react'
import type { CanvasAspectRatio, MediaAsset } from './editorProject'

interface VideoPlaybackProps {
  activeAsset: MediaAsset | null
  selectedRatio: CanvasAspectRatio
  rightControls: ReactNode
  onMediaError: (mediaId: string) => void
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

const resetVideo = (video: HTMLVideoElement): void => {
  video.pause()
  if (video.readyState > 0) video.currentTime = 0
}

function VideoPlayback({
  activeAsset,
  selectedRatio,
  rightControls,
  onMediaError
}: VideoPlaybackProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isVideoReady, setIsVideoReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const isActiveAssetReady = activeAsset?.status === 'ready'
  const canvasStyle: CanvasStyle = {
    '--canvas-aspect-ratio': `${selectedRatio.width} / ${selectedRatio.height}`,
    '--canvas-ratio-value': selectedRatio.width / selectedRatio.height
  }

  useEffect(() => {
    const video = videoRef.current
    if (video) resetVideo(video)

    return () => {
      if (video) resetVideo(video)
    }
  }, [activeAsset?.id])

  const togglePlayback = async (): Promise<void> => {
    const video = videoRef.current
    if (!video || !activeAsset || !isActiveAssetReady || !isVideoReady) return

    if (!video.paused) {
      video.pause()
      return
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
              ? `${activeAsset.name} 播放器画布，画面比例 ${selectedRatio.label}`
              : `暂无预览内容，画面比例 ${selectedRatio.label}`
          }
        >
          {activeAsset && isActiveAssetReady ? (
            <video
              key={activeAsset.id}
              ref={videoRef}
              src={activeAsset.url}
              preload="auto"
              playsInline
              aria-label={`${activeAsset.name}播放器预览`}
              onLoadedData={(event) => {
                event.currentTarget.currentTime = 0
                setCurrentTime(0)
                setDuration(event.currentTarget.duration)
                setIsVideoReady(true)
              }}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onError={() => {
                setIsVideoReady(false)
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
            dateTime={`PT${getWholeSeconds(currentTime)}S`}
          >
            {formatPlaybackTime(currentTime)}
          </time>
          <span className="studio-player__time-divider" aria-hidden="true">
            /
          </span>
          <time dateTime={`PT${getWholeSeconds(duration)}S`}>{formatPlaybackTime(duration)}</time>

          <button type="button" aria-label="片段列表" title="片段列表" disabled>
            <ListVideo size={17} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <button
          className="studio-player__play"
          type="button"
          aria-label={isPlaying ? '暂停' : '播放'}
          title={isPlaying ? '暂停' : '播放'}
          disabled={!isActiveAssetReady || !isVideoReady}
          onClick={() => void togglePlayback()}
        >
          {isPlaying ? (
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

export default VideoPlayback
