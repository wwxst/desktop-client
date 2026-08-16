import { useReducer, useState, type JSX } from 'react'
import AgentWorkspace from '../AgentWorkspace/AgentWorkspace'
import MediaLibraryView from '../MediaLibrary/MediaLibraryView'
import NovelPromotionSidePanel from '../NovelPromotion/NovelPromotionSidePanel'
import NovelPromotionView from '../NovelPromotion/NovelPromotionView'
import PluginsView from '../Plugins/PluginsView'
import SettingsView from '../Settings/SettingsView'
import Sidebar from '../Sidebar/Sidebar'
import TtsVoiceoverView from '../TtsVoiceover/TtsVoiceoverView'
import Layout from '../../layouts/Layout'
import './WorkspaceView.css'
import {
  initialWorkspaceNavigationState,
  workspaceNavigationReducer,
  type WorkspaceMenu
} from '../../workspaceNavigation'

/**
 * 登录后的总工作区，负责菜单导航以及左、中、右三块区域的组合。
 */
function WorkspaceView(): JSX.Element {
  const [navigation, dispatchNavigation] = useReducer(
    workspaceNavigationReducer,
    initialWorkspaceNavigationState
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [modelRefreshKey, setModelRefreshKey] = useState(0)
  const [agentWorkspaceKey, setAgentWorkspaceKey] = useState(0)

  const openSettings = (): void => {
    setSettingsOpen(true)
  }

  const closeSettings = (): void => {
    setSettingsOpen(false)
    setModelRefreshKey((current) => current + 1)
  }

  const handleSidebarItemSelect = (menu: WorkspaceMenu): void => {
    if (menu === 'home') setAgentWorkspaceKey((current) => current + 1)
    dispatchNavigation({ type: 'menu/selected', menu })
  }

  let workspaceContent: JSX.Element = (
    <AgentWorkspace
      key={agentWorkspaceKey}
      onOpenSettings={openSettings}
      modelRefreshKey={modelRefreshKey}
    />
  )
  let useNovelPromotionPanel = false

  if (navigation.activeMenu === 'novel-promotion') {
    workspaceContent = <NovelPromotionView />
    useNovelPromotionPanel = true
  }

  if (navigation.activeMenu === 'tts-voiceover') {
    workspaceContent = (
      <TtsVoiceoverView
        onOpenPlugins={() => dispatchNavigation({ type: 'menu/selected', menu: 'plugins' })}
      />
    )
  }

  if (navigation.activeMenu === 'plugins') {
    workspaceContent = (
      <PluginsView
        onOpenTts={() => dispatchNavigation({ type: 'menu/selected', menu: 'tts-voiceover' })}
      />
    )
  }

  if (navigation.activeMenu === 'media-library') {
    workspaceContent = <MediaLibraryView />
  }

  return (
    <div className="workspace-view">
      <div className="workspace-view__application" hidden={settingsOpen}>
        <Layout
          sidebar={
            <Sidebar
              activeItem={navigation.activeMenu}
              onItemSelect={handleSidebarItemSelect}
              onSettingsSelect={openSettings}
            />
          }
          content={workspaceContent}
          rightPanel={useNovelPromotionPanel ? <NovelPromotionSidePanel /> : undefined}
        />
      </div>
      {settingsOpen && <SettingsView onBack={closeSettings} />}
    </div>
  )
}

export default WorkspaceView
