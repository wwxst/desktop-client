import type {
  CSSProperties,
  FormEvent,
  JSX,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject
} from 'react'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import type { CanvasAspectRatio } from './editorProject'

interface CanvasRatioMenuProps {
  selectedRatio: CanvasAspectRatio
  triggerRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onAspectRatioChange: (aspectRatio: CanvasAspectRatio) => void
}

interface RatioPreviewStyle extends CSSProperties {
  '--option-ratio': string
  '--option-ratio-value': number
}

const SOURCE_RATIO_LABEL = '适应（原始）'

const LANDSCAPE_RATIOS: CanvasAspectRatio[] = [
  { id: '16:9', label: '16:9（西瓜视频）', width: 16, height: 9 },
  { id: '4:3', label: '4:3', width: 4, height: 3 },
  { id: '2.35:1', label: '2.35:1', width: 2.35, height: 1 },
  { id: '2:1', label: '2:1', width: 2, height: 1 },
  { id: '1.85:1', label: '1.85:1', width: 1.85, height: 1 }
]

const PORTRAIT_RATIOS: CanvasAspectRatio[] = [
  { id: '9:16', label: '9:16（抖音）', width: 9, height: 16 },
  { id: '3:4', label: '3:4', width: 3, height: 4 },
  { id: '5.8-inch', label: '5.8寸', width: 9, height: 19.5 },
  { id: '1:1', label: '1:1', width: 1, height: 1 }
]

function CanvasRatioMenu({
  selectedRatio,
  triggerRef,
  onClose,
  onAspectRatioChange
}: CanvasRatioMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const [isCustomMode, setIsCustomMode] = useState(false)
  const [customWidth, setCustomWidth] = useState('9')
  const [customHeight, setCustomHeight] = useState('16')
  const parsedCustomWidth = Number(customWidth)
  const parsedCustomHeight = Number(customHeight)
  const isCustomRatioValid =
    Number.isFinite(parsedCustomWidth) &&
    parsedCustomWidth > 0 &&
    Number.isFinite(parsedCustomHeight) &&
    parsedCustomHeight > 0

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) onClose()
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, triggerRef])

  useEffect(() => {
    if (isCustomMode) return undefined

    const focusFrame = window.requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')
        ?.focus()
    })

    return () => window.cancelAnimationFrame(focusFrame)
  }, [isCustomMode])

  const selectAspectRatio = (option: CanvasAspectRatio): void => {
    onAspectRatioChange(option)
    onClose()
    triggerRef.current?.focus()
  }

  const applyCustomRatio = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!isCustomRatioValid) return

    selectAspectRatio({
      id: `custom-${parsedCustomWidth}-${parsedCustomHeight}`,
      label: `${parsedCustomWidth}:${parsedCustomHeight}`,
      width: parsedCustomWidth,
      height: parsedCustomHeight
    })
  }

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !menuRef.current) return

    const menuItems = Array.from(
      menuRef.current.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')
    )
    if (menuItems.length === 0) return

    event.preventDefault()
    const activeIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement)
    let nextIndex = activeIndex

    if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = menuItems.length - 1
    else if (event.key === 'ArrowDown') {
      nextIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % menuItems.length
    } else nextIndex = activeIndex <= 0 ? menuItems.length - 1 : activeIndex - 1

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

  if (isCustomMode) {
    return (
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
    )
  }

  return (
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
  )
}

export default CanvasRatioMenu
