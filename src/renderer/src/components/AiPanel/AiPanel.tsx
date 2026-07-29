import type { JSX } from 'react'
import type { MenuItem } from '../shared/workspaceNavigation'
import './AiPanel.css'

interface AiPanelProps {
  currentMenu: MenuItem
}

/**
 * 登录后页面右侧的 AI 助手区域。
 */
function AiPanel({ currentMenu }: AiPanelProps): JSX.Element {
  return (
    <div className="studio-ai-panel">
      <header className="studio-ai-panel__header">
        <div className="studio-ai-panel__identity">
          <div className="studio-ai-logo">AI</div>

          <div>
            <strong>AI 助手</strong>
            <span>智能助手</span>
          </div>
        </div>

        <button className="studio-ai-more" type="button" aria-label="AI助手更多操作">
          ···
        </button>
      </header>

      <div className="studio-ai-context">
        <span>当前上下文</span>
        <strong>{currentMenu.label}</strong>
      </div>

      <div className="studio-ai-panel__body">
        <div className="studio-ai-placeholder">
          <div className="studio-ai-placeholder__icon">AI</div>

          <h2>右侧固定为 AI 区域</h2>

          <p>后续在这里接入对话、任务理解、工作流规划、 智能体执行状态和工具调用记录。</p>
        </div>
      </div>

      <footer className="studio-ai-input">
        <textarea placeholder="向 AI 描述你要完成的任务……" rows={3} />

        <div className="studio-ai-input__footer">
          <button type="button">添加上下文</button>

          <button className="studio-ai-send" type="button" disabled>
            发送
          </button>
        </div>
      </footer>
    </div>
  )
}

export default AiPanel
