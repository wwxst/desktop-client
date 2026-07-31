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
        <span>文件</span>
        <span>编辑</span>
        <span>查看</span>
        <span>帮助</span>
      </div>
    </header>
  )
}

export default TitleBar
