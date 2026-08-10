import type { JSX } from 'react'
import { useCallback, useRef, useState } from 'react'
import { Maximize2, Minus, Monitor, Plus, Ratio } from 'lucide-react'
import CanvasRatioMenu from './CanvasRatioMenu'
import type { ClipPatch } from './editorCommands'
import type {
  CanvasAspectRatio,
  EditorProjectState,
  EditorTrack,
  MediaAsset,
  ResolvedTimelineClip
} from './editorProject'
import VideoPlayback from './VideoPlayback'
import type { EditorPlaybackController } from './playback/editorPlaybackController'
import type { EditorInteractionController } from './interaction/editorInteractionController'
import './PlayerPanel.css'

interface PlayerPanelProps {
  project?: EditorProjectState
  playbackController?: EditorPlaybackController
  interactionController?: EditorInteractionController
  activeAsset?: MediaAsset | null
  selectedRatio: CanvasAspectRatio
  onAspectRatioChange: (aspectRatio: CanvasAspectRatio) => void
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
}

const PREVIEW_ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2]

function PlayerPanel({
  activeAsset,
  selectedRatio,
  onAspectRatioChange,
  onMediaError,
  project,
  playbackController,
  interactionController,
  activeClip = null,
  activeTrack = null,
  playhead = 0,
  onPlayheadChange,
  onSelectClip,
  onUpdateClip,
  onUpdateClipById,
  onDeleteClip,
  onCutClip,
  onCopyClip,
  onDuplicateClip,
  onToggleClipMuted,
  onToggleClipEnabled,
  onResetClipTransform
}: PlayerPanelProps): JSX.Element {
  const rootRef = useRef<HTMLElement>(null)
  const ratioButtonRef = useRef<HTMLButtonElement>(null)
  const [isRatioMenuOpen, setIsRatioMenuOpen] = useState(false)
  const [previewZoom, setPreviewZoom] = useState(1)
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 })
  const closeRatioMenu = useCallback(() => setIsRatioMenuOpen(false), [])

  const fitPreview = (): void => {
    setPreviewZoom(1)
    setPreviewPan({ x: 0, y: 0 })
  }

  const changeZoom = (direction: -1 | 1): void => {
    const current = PREVIEW_ZOOM_LEVELS.findIndex((value) => value >= previewZoom - 0.001)
    const base = current === -1 ? PREVIEW_ZOOM_LEVELS.length - 1 : current
    const index = Math.min(PREVIEW_ZOOM_LEVELS.length - 1, Math.max(0, base + direction))
    setPreviewZoom(PREVIEW_ZOOM_LEVELS[index])
    if (PREVIEW_ZOOM_LEVELS[index] <= 1) setPreviewPan({ x: 0, y: 0 })
  }

  return (
    <section ref={rootRef} className="studio-player" aria-label="播放器">
      <header className="studio-player__header">
        <h2>预览</h2>
        <span className="studio-player__header-hint">画面可直接拖动 / 缩放 / 旋转</span>
      </header>
      <VideoPlayback
        project={project}
        playbackController={playbackController}
        interactionController={interactionController}
        activeAsset={activeAsset}
        activeClip={activeClip}
        activeTrack={activeTrack}
        playhead={playhead}
        selectedRatio={selectedRatio}
        onPlayheadChange={onPlayheadChange}
        onMediaError={onMediaError}
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
        previewZoom={previewZoom}
        previewPan={previewPan}
        onPreviewPanChange={setPreviewPan}
        rightControls={
          <>
            <div className="studio-player__preview-zoom" aria-label="预览缩放">
              <button type="button" aria-label="缩小预览" title="缩小预览" onClick={() => changeZoom(-1)} disabled={previewZoom <= PREVIEW_ZOOM_LEVELS[0]}>
                <Minus size={14} aria-hidden="true" />
              </button>
              <button type="button" className="studio-player__zoom-value" onClick={fitPreview} title="点击恢复适应画布">
                {Math.round(previewZoom * 100)}%
              </button>
              <button type="button" aria-label="放大预览" title="放大预览" onClick={() => changeZoom(1)} disabled={previewZoom >= PREVIEW_ZOOM_LEVELS.at(-1)!}>
                <Plus size={14} aria-hidden="true" />
              </button>
            </div>
            <button type="button" aria-label="适应画布" title="适应画布" onClick={fitPreview}>
              <Monitor size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button
              ref={ratioButtonRef}
              type="button"
              aria-label="画面比例"
              title={`画面比例：${selectedRatio.label}`}
              aria-haspopup="menu"
              aria-expanded={isRatioMenuOpen}
              onClick={() => setIsRatioMenuOpen((isOpen) => !isOpen)}
            >
              <Ratio size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="全屏预览"
              title="全屏预览"
              onClick={() => {
                const element = rootRef.current
                if (!element) return
                if (document.fullscreenElement) void document.exitFullscreen()
                else void element.requestFullscreen?.()
              }}
            >
              <Maximize2 size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </>
        }
      />
      {isRatioMenuOpen && (
        <CanvasRatioMenu
          selectedRatio={selectedRatio}
          triggerRef={ratioButtonRef}
          onClose={closeRatioMenu}
          onAspectRatioChange={onAspectRatioChange}
        />
      )}
    </section>
  )
}

export default PlayerPanel
