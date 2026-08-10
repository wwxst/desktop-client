import type { JSX, ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './EditorContextMenu.css'

export interface EditorContextMenuItem {
  id: string
  label?: string
  shortcut?: string
  icon?: ReactNode
  disabled?: boolean
  danger?: boolean
  separator?: boolean
  onSelect?: () => void
}

interface EditorContextMenuProps {
  x: number
  y: number
  items: readonly EditorContextMenuItem[]
  onClose: () => void
  ariaLabel?: string
}

export default function EditorContextMenu({
  x,
  y,
  items,
  onClose,
  ariaLabel = '快捷菜单'
}: EditorContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x, y })

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    const padding = 8
    const nextX = Math.min(x, Math.max(padding, window.innerWidth - rect.width - padding))
    const nextY = Math.min(y, Math.max(padding, window.innerHeight - rect.height - padding))
    setPosition({ x: Math.max(padding, nextX), y: Math.max(padding, nextY) })
  }, [x, y])

  useEffect(() => {
    const close = (): void => onClose()
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="studio-context-menu"
      role="menu"
      aria-label={ariaLabel}
      style={{ left: position.x, top: position.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) =>
        item.separator ? (
          <div key={item.id} className="studio-context-menu__separator" role="separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className="studio-context-menu__item"
            data-danger={item.danger ? 'true' : undefined}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              item.onSelect?.()
              onClose()
            }}
          >
            <span className="studio-context-menu__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="studio-context-menu__label">{item.label}</span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>
        )
      )}
    </div>
  )
}
