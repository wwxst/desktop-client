import type { JSX } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import FunctionPanel from './FunctionPanel'
import ParameterPanel from './ParameterPanel'
import PlayerPanel from './PlayerPanel'
import Timeline from './Timeline'
import './WorkspaceView.css'

/**
 * 中间剪辑工作区：上方为功能、播放和参数区域，下方为横跨三块的时间线。
 */
function WorkspaceView(): JSX.Element {
  return (
    <section className="studio-workspace" aria-label="剪辑工作区">
      <Group
        className="studio-workspace__rows"
        orientation="vertical"
        resizeTargetMinimumSize={{ fine: 8, coarse: 16 }}
      >
        <Panel id="workspace-top" defaultSize="68" minSize={280}>
          <div className="studio-workspace__top">
            <Group
              className="studio-workspace__columns"
              orientation="horizontal"
              resizeTargetMinimumSize={{ fine: 8, coarse: 16 }}
            >
              <Panel
                id="function-panel"
                defaultSize={148}
                minSize={112}
                maxSize={240}
                groupResizeBehavior="preserve-pixel-size"
              >
                <FunctionPanel />
              </Panel>

              <Separator
                id="function-panel-resize-handle"
                className="studio-workspace__column-resize-handle"
                aria-label="调整功能区宽度"
              />

              <Panel id="player-panel" minSize={220}>
                <PlayerPanel />
              </Panel>

              <Separator
                id="parameter-panel-resize-handle"
                className="studio-workspace__column-resize-handle"
                aria-label="调整参数区宽度"
              />

              <Panel
                id="parameter-panel"
                defaultSize={180}
                minSize={140}
                maxSize={300}
                groupResizeBehavior="preserve-pixel-size"
              >
                <ParameterPanel />
              </Panel>
            </Group>
          </div>
        </Panel>

        <Separator
          id="workspace-timeline-resize-handle"
          className="studio-workspace__row-resize-handle"
          aria-label="调整时间线高度"
        />

        <Panel id="workspace-timeline" defaultSize="32" minSize={176} maxSize="55">
          <div className="studio-workspace__timeline">
            <Timeline />
          </div>
        </Panel>
      </Group>
    </section>
  )
}

export default WorkspaceView
