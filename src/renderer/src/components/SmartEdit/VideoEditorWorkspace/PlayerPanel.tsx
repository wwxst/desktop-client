import type { JSX } from 'react'
import { useCallback, useRef, useState } from 'react'
import { Maximize2, Menu, Monitor, Ratio } from 'lucide-react'
import CanvasRatioMenu from './CanvasRatioMenu'
import type {
  CanvasAspectRatio,
  EditorProjectState,
  MediaAsset,
  EditorTrack,
  ResolvedTimelineClip
} from './editorProject'
import VideoPlayback from './VideoPlayback'
import './PlayerPanel.css'

interface PlayerPanelProps {
  project?: EditorProjectState
  activeAsset?: MediaAsset | null
  selectedRatio: CanvasAspectRatio
  onAspectRatioChange: (aspectRatio: CanvasAspectRatio) => void
  onMediaError: (mediaId: string) => void
  /** V1 新增；保持可选以兼容旧调用/测试。 */
  activeClip?: ResolvedTimelineClip | null
  activeTrack?: EditorTrack | null
  playhead?: number
  onPlayheadChange?: (time: number) => void
}

function PlayerPanel({
  activeAsset,
  selectedRatio,
  onAspectRatioChange,
  onMediaError,
  project,
  activeClip = null,
  activeTrack = null,
  playhead = 0,
  onPlayheadChange
}: PlayerPanelProps): JSX.Element {
  const ratioButtonRef = useRef<HTMLButtonElement>(null)
  const [isRatioMenuOpen, setIsRatioMenuOpen] = useState(false)
  const closeRatioMenu = useCallback(() => setIsRatioMenuOpen(false), [])

  return (
    <section className="studio-player" aria-label="播放器">
      <header className="studio-player__header">
        <h2>播放器</h2>
        <button type="button" aria-label="播放器菜单" title="播放器菜单" disabled>
          <Menu size={17} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>
      <VideoPlayback
        project={project}
        activeAsset={activeAsset}
        activeClip={activeClip}
        activeTrack={activeTrack}
        playhead={playhead}
        selectedRatio={selectedRatio}
        onPlayheadChange={onPlayheadChange}
        onMediaError={onMediaError}
        rightControls={
          <>
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
              onClick={() => setIsRatioMenuOpen((isOpen) => !isOpen)}
            >
              <Ratio size={17} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button type="button" aria-label="全屏" title="全屏" disabled>
              <Maximize2 size={17} strokeWidth={1.75} aria-hidden="true" />
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
