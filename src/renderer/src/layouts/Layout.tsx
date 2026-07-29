import type { JSX, ReactNode } from 'react'

import './Layout.css'

interface LayoutProps {
  /** 左侧区域。 */
  sidebar: ReactNode

  /** 中间区域。 */
  content: ReactNode

  /** 右侧区域。 */
  aiPanel: ReactNode
}

/**
 * 客户端登录后的空白三栏布局。
 * 只负责三栏排列和区域尺寸，具体内容由外部组件传入。
 */
function Layout({ sidebar, content, aiPanel }: LayoutProps): JSX.Element {
  return (
    <div className="app-layout">
      <aside className="app-layout__sidebar">{sidebar}</aside>

      <main className="app-layout__content">{content}</main>

      <aside className="app-layout__ai-panel">{aiPanel}</aside>
    </div>
  )
}

export default Layout
