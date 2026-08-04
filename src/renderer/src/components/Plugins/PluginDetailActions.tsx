import { ChevronDown, Play, Settings, Trash2 } from 'lucide-react'
import { useRef, useState, type FocusEvent, type JSX, type KeyboardEvent } from 'react'

import Button from '../ui/Button'

interface PluginDetailActionsProps {
  pluginName: string
  disabled: boolean
  onOpenTts: () => void
  onRemove: () => void
  onOpenDirectory: () => void
}

function PluginDetailActions({
  pluginName,
  disabled,
  onOpenTts,
  onRemove,
  onOpenDirectory
}: PluginDetailActionsProps): JSX.Element {
  const [removeMenuOpen, setRemoveMenuOpen] = useState(false)
  const removeTriggerRef = useRef<HTMLButtonElement>(null)

  const handleRemoveMenuBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setRemoveMenuOpen(false)
    }
  }

  const handleRemoveMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setRemoveMenuOpen(false)
      removeTriggerRef.current?.focus()
    }
  }

  return (
    <div className="plugin-detail-actions" aria-label="插件操作">
      <Button size="sm" icon={<Play strokeWidth={1.9} />} disabled={disabled} onClick={onOpenTts}>
        打开配音
      </Button>

      {/* 当前模型层没有启用状态接口，先保留参考布局中的禁用入口但不提供假操作。 */}
      <button
        className="plugin-detail-actions__menu-button"
        type="button"
        aria-label={`禁用${pluginName}`}
        title="暂不支持禁用插件"
        disabled
      >
        <span>禁用</span>
        <ChevronDown size={13} strokeWidth={1.8} aria-hidden="true" />
      </button>

      <div
        className="plugin-detail-actions__dropdown"
        onBlur={handleRemoveMenuBlur}
        onKeyDown={handleRemoveMenuKeyDown}
      >
        <button
          ref={removeTriggerRef}
          className="plugin-detail-actions__menu-button"
          type="button"
          aria-label={`卸载${pluginName}`}
          aria-haspopup="menu"
          aria-expanded={removeMenuOpen}
          disabled={disabled}
          onClick={() => setRemoveMenuOpen((current) => !current)}
        >
          <span>卸载</span>
          <ChevronDown size={13} strokeWidth={1.8} aria-hidden="true" />
        </button>

        {removeMenuOpen && (
          <div className="plugin-detail-actions__popover" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setRemoveMenuOpen(false)
                onRemove()
              }}
            >
              <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
              <span>卸载插件</span>
            </button>
          </div>
        )}
      </div>

      {/* 自动更新尚未接入版本检查服务，因此不可勾选。 */}
      <label className="plugin-detail-actions__auto-update" title="暂不支持自动更新">
        <input type="checkbox" aria-label={`自动更新${pluginName}`} disabled />
        <span>自动更新</span>
      </label>

      <button
        className="plugin-detail-actions__settings"
        type="button"
        aria-label={`打开${pluginName}目录`}
        title="打开插件目录"
        disabled={disabled}
        onClick={onOpenDirectory}
      >
        <Settings size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  )
}

export default PluginDetailActions
