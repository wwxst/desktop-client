import type { CSSProperties, FormEvent, JSX, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Film,
  ListVideo,
  Maximize2,
  Menu,
  Monitor,
  Pause,
  Play,
  Ratio
} from 'lucide-react'
import type { CanvasAspectRatio, MediaAsset } from './editorProject'

interface PlayerPanelProps {
  activeAsset: MediaAsset | null
  selectedRatio: CanvasAspectRatio
  onAspectRatioChange: (ratio: CanvasAspectRatio) => void
}

interface CanvasStyle extends CSSProperties {
  '--canvas-aspect-ratio': string
  '--canvas-ratio-value': number
}

interface RatioPreviewStyle extends CSSProperties {
  '--option-ratio': string
  '--option-ratio-value': number
}

const DEFAULT_ASPECT_RATIO_ID = '9:16'
const SOURCE_RATIO_LABEL = '适应（原始）'

const DEFAULT_ASPECT_RATIO: CanvasAspectRatio = {
  id: DEFAULT_ASPECT_RATIO_ID,
  label: '9:16（抖音）',
  width: 9,
  height: 16
}

const LANDSCAPE_RATIOS: CanvasAspectRatio[] = [
  { id: '16:9', label: '16:9（西瓜视频）', width: 16, height: 9 },
  { id: '4:3', label: '4:3', width: 4, height: 3 },
  { id: '2.35:1', label: '2.35:1', width: 2.35, height: 1 },
  { id: '2:1', label: '2:1', width: 2, height: 1 },
  { id: '1.85:1', label: '1.85:1', width: 1.85, height: 1 }
]

const PORTRAIT_RATIOS: CanvasAspectRatio[] = [
  DEFAULT_ASPECT_RATIO,
  { id: '3:4', label: '3:4', width: 3, height: 4 },
  { id: '5.8-inch', label: '5.8寸', width: 9, height: 19.5 },
  { id: '1:1', label: '1:1', width: 1, height: 1 }
]

const getWholeSeconds = (seconds: number): number =>
  Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0

const formatPlaybackTime = (seconds: number): string => {
  const totalSeconds = getWholeSeconds(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, '0')).join(':')
}

const resetVideo = (video: HTMLVideoElement): void => {
  video.pause()
  if (video.readyState > 0) video.currentTime = 0
}

function PlayerPanel({
  activeAsset,
  selectedRatio,
  onAspectRatioChange
}: PlayerPanelProps): JSX.Element {
  const ratioButtonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isRatioMenuOpen, setIsRatioMenuOpen] = useState(false)
  const [isCustomMode, setIsCustomMode] = useState(false)
  const [customWidth, setCustomWidth] = useState('9')
  const [customHeight, setCustomHeight] = useState('16')
  const [isVideoReady, setIsVideoReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const parsedCustomWidth = Number(customWidth)
  const parsedCustomHeight = Number(customHeight)
  const isCustomRatioValid =
    Number.isFinite(parsedCustomWidth) &&
    parsedCustomWidth > 0 &&
    Number.isFinite(parsedCustomHeight) &&
    parsedCustomHeight > 0

  const canvasStyle: CanvasStyle = {
    '--canvas-aspect-ratio': `${selectedRatio.width} / ${selectedRatio.height}`,
    '--canvas-ratio-value': selectedRatio.width / selectedRatio.height
  }

  const closeRatioMenu = (): void => {
    setIsRatioMenuOpen(false)
    setIsCustomMode(false)
  }

  useEffect(() => {
    const video = videoRef.current
    if (video) resetVideo(video)

    return () => {
      if (video) resetVideo(video)
    }
  }, [activeAsset?.id])

  useEffect(() => {
    if (!isRatioMenuOpen) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node

      if (!menuRef.current?.contains(target) && !ratioButtonRef.current?.contains(target)) {
        closeRatioMenu()
      }
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeRatioMenu()
        ratioButtonRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isRatioMenuOpen])

  useEffect(() => {
    if (!isRatioMenuOpen || isCustomMode) {
      return
    }

    const focusFrame = window.requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')
        ?.focus()
    })

    return () => window.cancelAnimationFrame(focusFrame)
  }, [isCustomMode, isRatioMenuOpen])

  const selectAspectRatio = (option: CanvasAspectRatio): void => {
    onAspectRatioChange(option)
    closeRatioMenu()
    ratioButtonRef.current?.focus()
  }

  const togglePlayback = async (): Promise<void> => {
    const video = videoRef.current
    if (!video || !activeAsset || !isVideoReady) return

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

  const applyCustomRatio = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    if (!isCustomRatioValid) {
      return
    }

    selectAspectRatio({
      id: `custom-${parsedCustomWidth}-${parsedCustomHeight}`,
      label: `${parsedCustomWidth}:${parsedCustomHeight}`,
      width: parsedCustomWidth,
      height: parsedCustomHeight
    })
  }

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return
    }

    if (!menuRef.current) {
      return
    }

    const menuItems = Array.from(
      menuRef.current.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')
    )

    if (menuItems.length === 0) {
      return
    }

    event.preventDefault()
    const activeIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement)
    let nextIndex = activeIndex

    if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = menuItems.length - 1
    } else if (event.key === 'ArrowDown') {
      nextIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % menuItems.length
    } else {
      nextIndex = activeIndex <= 0 ? menuItems.length - 1 : activeIndex - 1
    }

    menuItems[nextIndex]?.focus()
  }

  const renderRatioOption = (option: CanvasAspectRatio): JSX.Element => {
    const previewStyle: RatioPreviewStyle = {
      '--option-ratio': `${option.width} / ${option.height}`,
      '--option-ratio-value': option.width / option.height
    }

    return (
      <button
        key={option.id}
        className="studio-player__ratio-option"
        type="button"
        role="menuitemradio"
        aria-checked={selectedRatio.id === option.id}
        onClick={() => selectAspectRatio(option)}
      >
        <span className="studio-player__ratio-check" aria-hidden="true">
          {selectedRatio.id === option.id && <Check size={15} strokeWidth={2.2} />}
        </span>
        <span className="studio-player__ratio-label">{option.label}</span>
        <span className="studio-player__ratio-preview-frame" aria-hidden="true">
          <span className="studio-player__ratio-option-preview" style={previewStyle} />
        </span>
      </button>
    )
  }

  return (
    <section className="studio-player" aria-label="播放器">
      <header className="studio-player__header">
        <h2>播放器</h2>

        <button type="button" aria-label="播放器菜单" title="播放器菜单" disabled>
          <Menu size={17} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>

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
          {activeAsset ? (
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
          disabled={!activeAsset || !isVideoReady}
          onClick={() => void togglePlayback()}
        >
          {isPlaying ? (
            <Pause size={18} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Play size={18} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
          )}
        </button>

        <div className="studio-player__controls-right">
          <button type="button" aria-label="画面适配" title="画面适配" disabled>
            <Monitor size={17} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            ref={ratioButtonRef}
            type="button"
            aria-label="画面比例"
            title={`画面比例：${selectedRatio.label}`}
            aria-haspopup="menu"
            aria-expanded={isRatioMenuOpen}
            onClick={() => {
              setIsRatioMenuOpen((isOpen) => !isOpen)
              setIsCustomMode(false)
            }}
          >
            <Ratio size={17} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button type="button" aria-label="全屏" title="全屏" disabled>
            <Maximize2 size={17} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </footer>

      {isRatioMenuOpen && !isCustomMode && (
        <div
          ref={menuRef}
          className="studio-player__ratio-popover"
          role="menu"
          aria-label="画面比例"
          onKeyDown={handleMenuKeyDown}
        >
          <button
            className="studio-player__ratio-option"
            type="button"
            role="menuitemradio"
            aria-checked="false"
            disabled
          >
            <span className="studio-player__ratio-check" aria-hidden="true" />
            <span className="studio-player__ratio-label">{SOURCE_RATIO_LABEL}</span>
            <span className="studio-player__ratio-source-preview" aria-hidden="true" />
          </button>

          <button
            className="studio-player__ratio-option"
            type="button"
            role="menuitem"
            onClick={() => setIsCustomMode(true)}
          >
            <span className="studio-player__ratio-check" aria-hidden="true" />
            <span className="studio-player__ratio-label">自定义</span>
            <span className="studio-player__ratio-custom-symbol" aria-hidden="true">
              W:H
            </span>
          </button>

          <div className="studio-player__ratio-separator" role="separator" />
          {LANDSCAPE_RATIOS.map(renderRatioOption)}
          <div className="studio-player__ratio-separator" role="separator" />
          {PORTRAIT_RATIOS.map(renderRatioOption)}
        </div>
      )}

      {isRatioMenuOpen && isCustomMode && (
        <div
          ref={menuRef}
          className="studio-player__ratio-popover studio-player__ratio-popover--custom"
          role="dialog"
          aria-label="自定义画面比例"
        >
          <form className="studio-player__ratio-custom" onSubmit={applyCustomRatio}>
            <div className="studio-player__ratio-custom-header">
              <button
                type="button"
                aria-label="返回比例列表"
                title="返回比例列表"
                onClick={() => setIsCustomMode(false)}
              >
                <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />
              </button>
              <strong>自定义</strong>
            </div>

            <div className="studio-player__ratio-custom-fields">
              <label>
                <span>宽</span>
                <input
                  type="number"
                  min="0.01"
                  max="9999"
                  step="0.01"
                  value={customWidth}
                  aria-label="自定义宽度"
                  onChange={(event) => setCustomWidth(event.target.value)}
                />
              </label>
              <span aria-hidden="true">:</span>
              <label>
                <span>高</span>
                <input
                  type="number"
                  min="0.01"
                  max="9999"
                  step="0.01"
                  value={customHeight}
                  aria-label="自定义高度"
                  onChange={(event) => setCustomHeight(event.target.value)}
                />
              </label>
            </div>

            <button
              className="studio-player__ratio-custom-apply"
              type="submit"
              aria-label="应用自定义比例"
              title="应用自定义比例"
              disabled={!isCustomRatioValid}
            >
              <Check size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </section>
  )
}

export default PlayerPanel
