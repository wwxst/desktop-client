import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const navigationSource = await readFile(
  new URL('../src/renderer/src/workspaceNavigation.ts', import.meta.url),
  'utf8'
)
const navigationJavaScript = ts.transpileModule(navigationSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022
  }
}).outputText
const navigation = await import(
  `data:text/javascript;base64,${Buffer.from(navigationJavaScript).toString('base64')}`
)
const [draftViewSource, editorViewSource, smartEditStyles] = await Promise.all([
  readFile(
    new URL('../src/renderer/src/components/SmartEdit/SmartEditDraftView.tsx', import.meta.url),
    'utf8'
  ).catch(() => ''),
  readFile(
    new URL('../src/renderer/src/components/SmartEdit/SmartEditEditorView.tsx', import.meta.url),
    'utf8'
  ).catch(() => ''),
  readFile(
    new URL('../src/renderer/src/components/SmartEdit/SmartEdit.css', import.meta.url),
    'utf8'
  ).catch(() => '')
])

test('starts on the home menu with the smart edit draft list ready', () => {
  assert.deepEqual(navigation.initialWorkspaceNavigationState, {
    activeMenu: 'home',
    smartEditPage: 'draft-list'
  })
})

test('opens the smart edit draft list before creating an editor session', () => {
  let state = navigation.workspaceNavigationReducer(navigation.initialWorkspaceNavigationState, {
    type: 'menu/selected',
    menu: 'smart-edit'
  })
  assert.deepEqual(state, { activeMenu: 'smart-edit', smartEditPage: 'draft-list' })

  state = navigation.workspaceNavigationReducer(state, { type: 'draft/created' })
  assert.deepEqual(state, { activeMenu: 'smart-edit', smartEditPage: 'editor' })
  assert.strictEqual(navigation.workspaceNavigationReducer(state, { type: 'draft/created' }), state)
})

test('keeps the editor open when smart edit is reselected and closes back to drafts', () => {
  const editingState = { activeMenu: 'smart-edit', smartEditPage: 'editor' }
  assert.strictEqual(
    navigation.workspaceNavigationReducer(editingState, {
      type: 'menu/selected',
      menu: 'smart-edit'
    }),
    editingState
  )

  const draftState = navigation.workspaceNavigationReducer(editingState, {
    type: 'draft/closed'
  })
  assert.deepEqual(draftState, { activeMenu: 'smart-edit', smartEditPage: 'draft-list' })
  assert.strictEqual(
    navigation.workspaceNavigationReducer(draftState, { type: 'draft/closed' }),
    draftState
  )
})

test('resets the smart edit page after leaving and reopens the draft list', () => {
  const editingState = { activeMenu: 'smart-edit', smartEditPage: 'editor' }
  const homeState = navigation.workspaceNavigationReducer(editingState, {
    type: 'menu/selected',
    menu: 'home'
  })
  assert.deepEqual(homeState, { activeMenu: 'home', smartEditPage: 'draft-list' })
  assert.strictEqual(
    navigation.workspaceNavigationReducer(homeState, {
      type: 'menu/selected',
      menu: 'home'
    }),
    homeState
  )

  assert.deepEqual(
    navigation.workspaceNavigationReducer(homeState, {
      type: 'menu/selected',
      menu: 'smart-edit'
    }),
    { activeMenu: 'smart-edit', smartEditPage: 'draft-list' }
  )
})

test('ignores draft actions outside smart edit without replacing state', () => {
  const initial = navigation.initialWorkspaceNavigationState
  assert.strictEqual(
    navigation.workspaceNavigationReducer(initial, { type: 'draft/created' }),
    initial
  )
  assert.strictEqual(
    navigation.workspaceNavigationReducer(initial, { type: 'draft/closed' }),
    initial
  )
})

test('draft page only provides the create draft entry', () => {
  assert.match(draftViewSource, /aria-label="新建草稿"/)
  assert.match(draftViewSource, /onClick=\{onCreateDraft\}/)
  assert.doesNotMatch(draftViewSource, /草稿列表|最近编辑|删除草稿|重命名/)
})

test('editor wrapper mounts the video editor workspace below its toolbar', () => {
  assert.match(editorViewSource, /aria-label="返回草稿"/)
  assert.match(editorViewSource, /onClick=\{onReturnToDrafts\}/)
  assert.match(editorViewSource, /<VideoEditorWorkspace\s*\/>/)
  assert.match(smartEditStyles, /grid-template-rows:\s*40px minmax\(0, 1fr\)/)
})
