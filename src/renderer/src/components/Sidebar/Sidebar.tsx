import { useState, type JSX } from 'react'
import { BookOpen, Home, Settings, type LucideIcon } from 'lucide-react'
import './Sidebar.css'

type SidebarItem = 'home' | 'novel-promotion'

interface SidebarMenuItem {
  id: SidebarItem
  label: string
  icon: LucideIcon
}

const sidebarMenuItems: SidebarMenuItem[] = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'novel-promotion', label: '小说推文', icon: BookOpen }
]

/**
 * 工作台左侧的主菜单。
 */
function Sidebar(): JSX.Element {
  const [activeItem, setActiveItem] = useState<SidebarItem>('home')

  return (
    <nav className="studio-sidebar" aria-label="主菜单">
      <ul className="studio-sidebar__menu">
        {sidebarMenuItems.map((item) => {
          const Icon = item.icon

          return (
            <li key={item.id}>
              <button
                className="studio-sidebar__menu-item"
                type="button"
                aria-current={activeItem === item.id ? 'page' : undefined}
                onClick={() => setActiveItem(item.id)}
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
