import type { JSX, ReactNode, Ref } from 'react'
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels'

import './Layout.css'

interface LayoutProps {
  /** 左侧区域。 */
  sidebar: ReactNode

  /** 中间区域。 */
  content: ReactNode

  /** 右侧区域。 */
  aiPanel: ReactNode

  /** 允许右侧面板从自身工具栏折叠或恢复。 */
  aiPanelRef?: Ref<PanelImperativeHandle | null>
}

/**
 * 客户端登录后的可调整三栏布局。
 * 只负责三栏排列、尺寸约束和拖拽边界，具体内容由外部组件传入。
 */
function Layout({ sidebar, content, aiPanel, aiPanelRef }: LayoutProps): JSX.Element {
  return (
    <Group
      className="app-layout"
      orientation="horizontal"
      resizeTargetMinimumSize={{ fine: 8, coarse: 16 }}
    >
      <Panel
        id="sidebar"
        defaultSize={160}
        minSize={160}
        maxSize={360}
        groupResizeBehavior="preserve-pixel-size"
      >
        <aside className="app-layout__sidebar">{sidebar}</aside>
      </Panel>

      <Separator
        id="sidebar-resize-handle"
        className="app-layout__resize-handle"
        aria-label="调整左侧栏宽度"
      />

      <Panel id="content" minSize={430}>
        <main className="app-layout__content">{content}</main>
      </Panel>

      <Separator
        id="ai-panel-resize-handle"
        className="app-layout__resize-handle"
        aria-label="调整右侧栏宽度"
      />

      <Panel
        id="ai-panel"
        defaultSize={400}
        minSize={300}
        maxSize={560}
        collapsedSize={40}
        collapsible
        groupResizeBehavior="preserve-pixel-size"
        panelRef={aiPanelRef}
      >
        <aside className="app-layout__ai-panel">{aiPanel}</aside>
      </Panel>
    </Group>
  )
}

export default Layout
