import type { JSX } from 'react'
import { useCallback, useRef, useState } from 'react'
import { Maximize2, Ratio } from 'lucide-react'
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
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 })
  const closeRatioMenu = useCallback(() => setIsRatioMenuOpen(false), [])

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
        previewPan={previewPan}
        onPreviewPanChange={setPreviewPan}
        rightControls={
          <>
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
