import type { JSX } from 'react'
import type { MenuItem } from '../shared/workspaceNavigation'
import './WorkspaceView.css'

interface WorkspaceViewProps {
  currentMenu: MenuItem
  isCheckingSubscription: boolean
  onCreateTask: () => void
}

/**
 * 三栏布局中间的核心工作区。
 */
function WorkspaceView({
  currentMenu,
  isCheckingSubscription,
  onCreateTask
}: WorkspaceViewProps): JSX.Element {
  return (
    <div className="studio-workspace">
      <header className="studio-workspace__header">
        <div>
          <span className="studio-workspace__eyebrow">WORKSPACE</span>

          <h1>{currentMenu.label}</h1>
          <p>{currentMenu.description}</p>
        </div>

        <div className="studio-workspace__actions">
          <button className="studio-secondary-button" type="button">
            新建项目
          </button>

          <button
            className="studio-primary-button"
            type="button"
            disabled={isCheckingSubscription}
            onClick={onCreateTask}
          >
            {isCheckingSubscription ? '正在检查权限...' : '开始任务'}
          </button>
        </div>
      </header>

      <section className="studio-workspace__body">
        <div className="studio-workspace-placeholder">
          <span className="studio-placeholder-label">MAIN WORKSPACE</span>

          <h2>这里是中间核心工作区</h2>

          <p>后续的视频任务配置、素材预览、任务进度、 生成结果和编辑功能都放在这个区域。</p>
        </div>
      </section>
    </div>
  )
}

export default WorkspaceView
