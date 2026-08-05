import type { JSX } from 'react'
import {
  BookOpen,
  FolderOpen,
  Home,
  Mic2,
  Plug,
  Scissors,
  Settings,
  type LucideIcon
} from 'lucide-react'
import type { WorkspaceMenu } from '../../workspaceNavigation'
import './Sidebar.css'

interface SidebarMenuItem {
  id: WorkspaceMenu
  label: string
  icon: LucideIcon
}

interface SidebarProps {
  activeItem: WorkspaceMenu
  showSmartEdit: boolean
  onItemSelect: (item: WorkspaceMenu) => void
}

const menuItems: SidebarMenuItem[] = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'plugins', label: '插件', icon: Plug },
  { id: 'media-library', label: '媒体库', icon: FolderOpen },
  { id: 'smart-edit', label: '智剪', icon: Scissors },
  { id: 'novel-promotion', label: '小说推文', icon: BookOpen },
  { id: 'tts-voiceover', label: 'TTS 配音', icon: Mic2 }
]

/**
 * 工作台左侧的主菜单。
 */
function Sidebar({ activeItem, showSmartEdit, onItemSelect }: SidebarProps): JSX.Element {
  const visibleMenuItems = menuItems.filter((item) => item.id !== 'smart-edit' || showSmartEdit)

  return (
    <nav className="studio-sidebar" aria-label="主菜单">
      <ul className="studio-sidebar__menu">
        {visibleMenuItems.map((item) => {
          const Icon = item.icon

          return (
            <li key={item.id}>
              <button
                className="studio-sidebar__menu-item"
                type="button"
                aria-current={activeItem === item.id ? 'page' : undefined}
                onClick={() => onItemSelect(item.id)}
              >
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="studio-sidebar__user">
        <div className="studio-sidebar__avatar" aria-hidden="true">
          KA
        </div>

        <div className="studio-sidebar__identity">
          <span className="studio-sidebar__nickname">kasixmb</span>
          <span className="studio-sidebar__plan">Plus</span>
        </div>

        <button className="studio-sidebar__settings" type="button" aria-label="设置" title="设置">
          <Settings size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}

export default Sidebar
