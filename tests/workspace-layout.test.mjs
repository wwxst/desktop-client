import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('workspace renders three empty regions', async () => {
  const [app, sidebar, workspace, aiPanel] = await Promise.all([
    readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8'),
    readFile(
      new URL('../src/renderer/src/components/Sidebar/Sidebar.tsx', import.meta.url),
      'utf8'
    ),
    readFile(
      new URL('../src/renderer/src/components/WorkspaceView/WorkspaceView.tsx', import.meta.url),
      'utf8'
    ),
    readFile(new URL('../src/renderer/src/components/AiPanel/AiPanel.tsx', import.meta.url), 'utf8')
  ])

  assert.match(app, /sidebar={<Sidebar\s*\/>}/)
  assert.match(app, /content={<WorkspaceView\s*\/>}/)
  assert.match(app, /aiPanel={<AiPanel\s*\/>}/)
  assert.match(sidebar, /return <div className="studio-sidebar"\s*\/>/)
  assert.match(workspace, /return <div className="studio-workspace"\s*\/>/)
  assert.match(aiPanel, /return <div className="studio-ai-panel"\s*\/>/)
})

test('workspace layout uses gray white gray columns without dividers', async () => {
  const layoutCss = await readFile(
    new URL('../src/renderer/src/layouts/Layout.css', import.meta.url),
    'utf8'
  )

  assert.match(layoutCss, /\.app-layout__sidebar\s*{[^}]*background:\s*#f3f3f3;/s)
  assert.match(layoutCss, /\.app-layout__content\s*{[^}]*background:\s*#ffffff;/s)
  assert.match(layoutCss, /\.app-layout__ai-panel\s*{[^}]*background:\s*#f3f3f3;/s)
  assert.doesNotMatch(layoutCss, /border-(?:left|right):/)
})
