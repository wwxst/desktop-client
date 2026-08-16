export type WorkspaceMenu =
  'home' | 'plugins' | 'media-library' | 'novel-promotion' | 'tts-voiceover'

export interface WorkspaceNavigationState {
  activeMenu: WorkspaceMenu
}

export type WorkspaceNavigationAction = { type: 'menu/selected'; menu: WorkspaceMenu }

export const initialWorkspaceNavigationState: WorkspaceNavigationState = {
  activeMenu: 'home'
}

export function workspaceNavigationReducer(
  state: WorkspaceNavigationState,
  action: WorkspaceNavigationAction
): WorkspaceNavigationState {
  switch (action.type) {
    case 'menu/selected':
      return state.activeMenu === action.menu ? state : { activeMenu: action.menu }
  }
}
