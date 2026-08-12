import { useReducer, useRef, useState, type JSX } from 'react'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import AiPanel from '../AiPanel/AiPanel'
import MediaLibraryView from '../MediaLibrary/MediaLibraryView'
import NovelPromotionSidePanel from '../NovelPromotion/NovelPromotionSidePanel'
import NovelPromotionView from '../NovelPromotion/NovelPromotionView'
import PluginsView from '../Plugins/PluginsView'
import SettingsView from '../Settings/SettingsView'
import Sidebar from '../Sidebar/Sidebar'
import SmartEditDraftView from '../SmartEdit/SmartEditDraftView'
import SmartEditEditorView from '../SmartEdit/SmartEditEditorView'
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
  const smartEditEnabled = import.meta.env.DEV
  const aiPanelRef = useRef<PanelImperativeHandle>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [modelRefreshKey, setModelRefreshKey] = useState(0)

  const openSettings = (): void => {
    setSettingsOpen(true)
  }

  const closeSettings = (): void => {
    setSettingsOpen(false)
    setModelRefreshKey((current) => current + 1)
  }

  const handleSidebarItemSelect = (menu: WorkspaceMenu): void => {
    dispatchNavigation({
      type: 'menu/selected',
      menu: menu === 'smart-edit' && !smartEditEnabled ? 'home' : menu
    })
  }

  const activeSidebarItem =
    navigation.activeMenu === 'smart-edit' && !smartEditEnabled ? 'home' : navigation.activeMenu

  let workspaceContent: JSX.Element = <div className="workspace-empty-page" aria-hidden="true" />
  let useNovelPromotionPanel = false

  if (smartEditEnabled && navigation.activeMenu === 'smart-edit') {
    workspaceContent =
      navigation.smartEditPage === 'editor' ? (
        <SmartEditEditorView
          onReturnToDrafts={() => dispatchNavigation({ type: 'draft/closed' })}
        />
      ) : (
        <SmartEditDraftView onCreateDraft={() => dispatchNavigation({ type: 'draft/created' })} />
      )
  }

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
              activeItem={activeSidebarItem}
              showSmartEdit={smartEditEnabled}
              onItemSelect={handleSidebarItemSelect}
              onSettingsSelect={openSettings}
            />
          }
          content={workspaceContent}
          aiPanel={
            useNovelPromotionPanel ? (
              <NovelPromotionSidePanel />
            ) : (
              <AiPanel
                modelRefreshKey={modelRefreshKey}
                onCollapse={() => aiPanelRef.current?.collapse()}
                onExpand={() => aiPanelRef.current?.expand()}
                onOpenSettings={openSettings}
              />
            )
          }
          aiPanelRef={aiPanelRef}
        />
      </div>
      {settingsOpen && <SettingsView onBack={closeSettings} />}
    </div>
  )
}

export default WorkspaceView
