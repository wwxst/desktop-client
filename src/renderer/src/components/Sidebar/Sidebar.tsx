import type { JSX } from 'react'
import { workspaceMenuItems, type MenuKey } from '../shared/workspaceNavigation'
import './Sidebar.css'

interface SidebarProps {
  username: string
  activeMenu: MenuKey
  onMenuChange: (menu: MenuKey) => void
  onOpenActivation: () => void
}

/**
 * 登录后页面的左侧导航区域。
 */
function Sidebar({
  username,
  activeMenu,
  onMenuChange,
  onOpenActivation
}: SidebarProps): JSX.Element {
  const displayUsername = username.trim() || '当前用户'

  return (
    <div className="studio-sidebar">
      <header className="studio-sidebar__brand">
        <div className="studio-brand-logo">AI</div>

        <div className="studio-brand-text">
          <strong>AI 创作台</strong>
          <span>AI STUDIO</span>
        </div>
      </header>

      <nav className="studio-menu">
        <div className="studio-menu__group-title">创作空间</div>

        {workspaceMenuItems.map((item) => (
          <button
            key={item.key}
            className={
              activeMenu === item.key
                ? 'studio-menu-item studio-menu-item--active'
                : 'studio-menu-item'
            }
            type="button"
            onClick={() => onMenuChange(item.key)}
          >
            <span className="studio-menu-item__mark" />

            <span className="studio-menu-item__content">
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
          </button>
        ))}
      </nav>

      <div className="studio-sidebar__bottom">
        <button className="studio-subscription-entry" type="button" onClick={onOpenActivation}>
          <span>订阅与兑换</span>
          <strong>查看</strong>
        </button>

        <div className="studio-account">
          <div className="studio-account__avatar">{displayUsername.slice(0, 1).toUpperCase()}</div>

          <div className="studio-account__info">
            <strong>{displayUsername}</strong>
            <span>当前登录账号</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Sidebar
