import { Settings, Trash2 } from 'lucide-react'
import {
  useRef,
  useState,
  type FocusEvent,
  type JSX,
  type KeyboardEvent,
  type MouseEvent
} from 'react'

interface PluginActionMenuProps {
  label: string
  disabled: boolean
  onRemove: () => void
}

function PluginActionMenu({ label, disabled, onRemove }: PluginActionMenuProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const handleBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
  }

  const stopRowNavigation = (event: MouseEvent<HTMLDivElement>): void => {
    event.stopPropagation()
  }

  return (
    <div
      className="plugin-action-menu"
      onBlur={handleBlur}
      onClick={stopRowNavigation}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        className="plugin-action-menu__trigger"
        type="button"
        aria-label={`管理${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`管理${label}`}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <Settings size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>

      {open && (
        <div className="plugin-action-menu__popover" role="menu">
          <button
            className="plugin-action-menu__remove"
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onRemove()
            }}
          >
            <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>卸载</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default PluginActionMenu
