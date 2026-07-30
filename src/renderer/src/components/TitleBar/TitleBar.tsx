import type { JSX } from 'react'
import appIcon from '../../../../../resources/icon.png'
import './TitleBar.css'

/**
 * 应用窗口顶部的标题和拖动区域。
 * 最小化、最大化和关闭按钮由 Electron 保留的系统控件提供。
 */
function TitleBar(): JSX.Element {
  return (
    <header className="app-title-bar">
      <div className="app-title-bar__identity">
        <img src={appIcon} alt="" />
        <span>自动剪辑</span>
      </div>
    </header>
  )
}

export default TitleBar
