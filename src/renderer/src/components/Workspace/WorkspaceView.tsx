import { useReducer, type JSX } from 'react'
import AiPanel from '../AiPanel/AiPanel'
import Sidebar from '../Sidebar/Sidebar'
import SmartEditDraftView from '../SmartEdit/SmartEditDraftView'
import SmartEditEditorView from '../SmartEdit/SmartEditEditorView'
import TtsVoiceoverView from '../TtsVoiceover/TtsVoiceoverView'
import Layout from '../../layouts/Layout'
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

  const handleSidebarItemSelect = (menu: WorkspaceMenu): void => {
    dispatchNavigation({
      type: 'menu/selected',
      menu: menu === 'smart-edit' && !smartEditEnabled ? 'home' : menu
    })
  }

  const activeSidebarItem =
    navigation.activeMenu === 'smart-edit' && !smartEditEnabled ? 'home' : navigation.activeMenu

  let workspaceContent: JSX.Element = <div className="workspace-empty-page" aria-hidden="true" />

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

  if (navigation.activeMenu === 'tts-voiceover') {
    workspaceContent = <TtsVoiceoverView />
  }

  return (
    <Layout
      sidebar={
        <Sidebar
          activeItem={activeSidebarItem}
          showSmartEdit={smartEditEnabled}
          onItemSelect={handleSidebarItemSelect}
        />
      }
      content={workspaceContent}
      aiPanel={<AiPanel />}
    />
  )
}

export default WorkspaceView
