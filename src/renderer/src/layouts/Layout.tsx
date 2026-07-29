import type { JSX, ReactNode } from 'react'

import './Layout.css'

interface LayoutProps {
  /**
   * 左侧菜单区域。
   */
  sidebar: ReactNode

  /**
   * 中间主要内容区域。
   */
  content: ReactNode

  /**
   * 右侧 AI 区域。
   */
  aiPanel: ReactNode
}

/**
 * 客户端登录后的整体布局。
 *
 * 这个组件只负责三栏排列：
 * 左侧菜单、中间工作区、右侧 AI。
 *
 * 具体内容由外部组件传进来。
 */
function Layout({
  sidebar,
  content,
  aiPanel
}: LayoutProps): JSX.Element {
  return (
    <div className="app-layout">
      <aside className="app-layout__sidebar">
        {sidebar}
      </aside>

      <main className="app-layout__content">
        {content}
      </main>

      <aside className="app-layout__ai-panel">
        {aiPanel}
      </aside>
    </div>
  )
}

export default Layout
