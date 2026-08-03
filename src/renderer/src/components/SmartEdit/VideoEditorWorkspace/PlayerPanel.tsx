import type { JSX } from 'react'
import { useCallback, useRef, useState } from 'react'
import { Maximize2, Menu, Monitor, Ratio } from 'lucide-react'
import CanvasRatioMenu from './CanvasRatioMenu'
import type { CanvasAspectRatio, MediaAsset } from './editorProject'
import VideoPlayback from './VideoPlayback'
import './PlayerPanel.css'

interface PlayerPanelProps {
  activeAsset: MediaAsset | null
  selectedRatio: CanvasAspectRatio
  onAspectRatioChange: (aspectRatio: CanvasAspectRatio) => void
  onMediaError: (mediaId: string) => void
}

function PlayerPanel({
  activeAsset,
  selectedRatio,
  onAspectRatioChange,
  onMediaError
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
        activeAsset={activeAsset}
        selectedRatio={selectedRatio}
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
