export type WorkspaceMenu =
  | 'home'
  | 'plugins'
  | 'media-library'
  | 'smart-edit'
  | 'novel-promotion'
  | 'tts-voiceover'
export type SmartEditPage = 'draft-list' | 'editor'

export interface WorkspaceNavigationState {
  activeMenu: WorkspaceMenu
  smartEditPage: SmartEditPage
}

export type WorkspaceNavigationAction =
  | { type: 'menu/selected'; menu: WorkspaceMenu }
  | { type: 'draft/created' }
  | { type: 'draft/closed' }

export const initialWorkspaceNavigationState: WorkspaceNavigationState = {
  activeMenu: 'home',
  smartEditPage: 'draft-list'
}

export function workspaceNavigationReducer(
  state: WorkspaceNavigationState,
  action: WorkspaceNavigationAction
): WorkspaceNavigationState {
  switch (action.type) {
    case 'menu/selected':
      if (action.menu === 'smart-edit') {
        return state.activeMenu === 'smart-edit' ? state : { ...state, activeMenu: 'smart-edit' }
      }

      if (state.activeMenu === action.menu && state.smartEditPage === 'draft-list') {
        return state
      }

      return { activeMenu: action.menu, smartEditPage: 'draft-list' }

    case 'draft/created':
      if (state.activeMenu !== 'smart-edit' || state.smartEditPage === 'editor') {
        return state
      }

      return { ...state, smartEditPage: 'editor' }

    case 'draft/closed':
      if (state.activeMenu !== 'smart-edit' || state.smartEditPage === 'draft-list') {
        return state
      }

      return { ...state, smartEditPage: 'draft-list' }
  }
}
