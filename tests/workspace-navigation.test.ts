import { describe, expect, it } from 'vitest'
import {
  initialWorkspaceNavigationState,
  workspaceNavigationReducer,
  type WorkspaceNavigationState
} from '../src/renderer/src/workspaceNavigation'

describe('workspace navigation reducer', () => {
  it('starts on home with the smart edit draft list ready', () => {
    expect(initialWorkspaceNavigationState).toEqual({
      activeMenu: 'home',
      smartEditPage: 'draft-list'
    })
  })

  it('opens the draft list before creating an editor session', () => {
    let state = workspaceNavigationReducer(initialWorkspaceNavigationState, {
      type: 'menu/selected',
      menu: 'smart-edit'
    })
    expect(state).toEqual({ activeMenu: 'smart-edit', smartEditPage: 'draft-list' })

    state = workspaceNavigationReducer(state, { type: 'draft/created' })
    expect(state).toEqual({ activeMenu: 'smart-edit', smartEditPage: 'editor' })
    expect(workspaceNavigationReducer(state, { type: 'draft/created' })).toBe(state)
  })

  it('keeps the editor open when smart edit is reselected and closes to drafts', () => {
    const editingState: WorkspaceNavigationState = {
      activeMenu: 'smart-edit',
      smartEditPage: 'editor'
    }
    expect(
      workspaceNavigationReducer(editingState, { type: 'menu/selected', menu: 'smart-edit' })
    ).toBe(editingState)

    const draftState = workspaceNavigationReducer(editingState, { type: 'draft/closed' })
    expect(draftState).toEqual({ activeMenu: 'smart-edit', smartEditPage: 'draft-list' })
    expect(workspaceNavigationReducer(draftState, { type: 'draft/closed' })).toBe(draftState)
  })

  it('resets the smart edit page after leaving it', () => {
    const editingState: WorkspaceNavigationState = {
      activeMenu: 'smart-edit',
      smartEditPage: 'editor'
    }
    const homeState = workspaceNavigationReducer(editingState, {
      type: 'menu/selected',
      menu: 'home'
    })
    expect(homeState).toEqual({ activeMenu: 'home', smartEditPage: 'draft-list' })
    expect(workspaceNavigationReducer(homeState, { type: 'menu/selected', menu: 'home' })).toBe(
      homeState
    )
    expect(
      workspaceNavigationReducer(homeState, { type: 'menu/selected', menu: 'smart-edit' })
    ).toEqual({ activeMenu: 'smart-edit', smartEditPage: 'draft-list' })
  })

  it('ignores draft actions outside smart edit', () => {
    const initial = initialWorkspaceNavigationState
    expect(workspaceNavigationReducer(initial, { type: 'draft/created' })).toBe(initial)
    expect(workspaceNavigationReducer(initial, { type: 'draft/closed' })).toBe(initial)
  })
})
