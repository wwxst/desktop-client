import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('separates the total workspace from the video editor workspace', async () => {
  const [app, totalWorkspace, smartEditEditor, videoEditorWorkspace] = await Promise.all([
    readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8'),
    readFile(
      new URL('../src/renderer/src/components/Workspace/WorkspaceView.tsx', import.meta.url),
      'utf8'
    ).catch(() => ''),
    readFile(
      new URL('../src/renderer/src/components/SmartEdit/SmartEditEditorView.tsx', import.meta.url),
      'utf8'
    ),
    readFile(
      new URL(
        '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/VideoEditorWorkspace.tsx',
        import.meta.url
      ),
      'utf8'
    ).catch(() => '')
  ])

  assert.match(app, /import WorkspaceView from '.\/components\/Workspace\/WorkspaceView'/)
  assert.match(app, /<WorkspaceView\s*\/>/)
  assert.doesNotMatch(app, /workspaceNavigationReducer|<Layout\b|<Sidebar\b|<AiPanel\b/)

  assert.match(totalWorkspace, /useReducer\(\s*workspaceNavigationReducer/)
  assert.match(totalWorkspace, /<Layout\b/)
  assert.match(totalWorkspace, /<Sidebar\b/)
  assert.match(totalWorkspace, /aiPanel=\{<AiPanel\s*\/>\}/)

  assert.match(
    smartEditEditor,
    /import VideoEditorWorkspace from '.\/VideoEditorWorkspace\/VideoEditorWorkspace'/
  )
  assert.match(smartEditEditor, /<VideoEditorWorkspace\s*\/>/)
  assert.match(videoEditorWorkspace, /function VideoEditorWorkspace\(\): JSX\.Element/)
  assert.match(videoEditorWorkspace, /className="studio-workspace"/)
})

test('workspace keeps its side regions while selecting the center content', async () => {
  const [app, totalWorkspace, sidebar, smartEditEditor, videoEditor, playerPanel, aiPanel] =
    await Promise.all([
      readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8'),
      readFile(
        new URL('../src/renderer/src/components/Workspace/WorkspaceView.tsx', import.meta.url),
        'utf8'
      ),
      readFile(
        new URL('../src/renderer/src/components/Sidebar/Sidebar.tsx', import.meta.url),
        'utf8'
      ),
      readFile(
        new URL('../src/renderer/src/components/SmartEdit/SmartEditEditorView.tsx', import.meta.url),
        'utf8'
      ),
      readFile(
        new URL(
          '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/VideoEditorWorkspace.tsx',
          import.meta.url
        ),
        'utf8'
      ),
      readFile(
        new URL(
          '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/PlayerPanel.tsx',
          import.meta.url
        ),
        'utf8'
      ),
      readFile(
        new URL('../src/renderer/src/components/AiPanel/AiPanel.tsx', import.meta.url),
        'utf8'
      )
    ])

  assert.match(app, /<WorkspaceView\s*\/>/)
  assert.doesNotMatch(app, /\bTimeline\b/)
  assert.match(totalWorkspace, /useReducer\(\s*workspaceNavigationReducer/)
  assert.match(totalWorkspace, /const smartEditEnabled = import\.meta\.env\.DEV/)
  assert.match(totalWorkspace, /className="workspace-empty-page"/)
  assert.match(totalWorkspace, /<SmartEditDraftView/)
  assert.match(totalWorkspace, /<SmartEditEditorView/)
  assert.match(totalWorkspace, /showSmartEdit=\{smartEditEnabled\}/)
  assert.match(totalWorkspace, /aiPanel=\{<AiPanel\s*\/>\}/)
  assert.match(sidebar, /className="studio-sidebar"/)
  assert.match(smartEditEditor, /<VideoEditorWorkspace\s*\/>/)
  assert.match(videoEditor, /<PlayerPanel\b/)
  assert.match(playerPanel, /className="studio-player"/)
  assert.match(aiPanel, /return <div className="studio-ai-panel"\s*\/>/)
})

test('sidebar is controlled and only includes smart edit when enabled', async () => {
  const [packageJson, sidebar, sidebarCss] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(
      new URL('../src/renderer/src/components/Sidebar/Sidebar.tsx', import.meta.url),
      'utf8'
    ),
    readFile(new URL('../src/renderer/src/components/Sidebar/Sidebar.css', import.meta.url), 'utf8')
  ])
  const packageData = JSON.parse(packageJson)

  assert.equal(typeof packageData.dependencies?.['lucide-react'], 'string')
  assert.match(
    sidebar,
    /import\s*{[^}]*BookOpen[^}]*Home[^}]*Scissors[^}]*}\s*from 'lucide-react'/s
  )
  assert.match(sidebar, /interface SidebarProps/)
  assert.match(sidebar, /activeItem:\s*WorkspaceMenu/)
  assert.match(sidebar, /showSmartEdit:\s*boolean/)
  assert.match(sidebar, /onItemSelect:\s*\(item: WorkspaceMenu\) => void/)
  assert.match(sidebar, /showSmartEdit\s*\?\s*\[\.\.\.baseMenuItems, smartEditMenuItem\]/)
  assert.match(sidebar, /onClick=\{\(\) => onItemSelect\(item\.id\)\}/)
  assert.doesNotMatch(sidebar, /useState/)
  assert.ok(sidebar.indexOf('首页') < sidebar.indexOf('小说推文'))
  assert.ok(sidebar.indexOf('小说推文') < sidebar.indexOf('智剪'))
  assert.match(sidebar, /aria-current={activeItem === item\.id \? 'page' : undefined}/)
  assert.match(sidebarCss, /\.studio-sidebar__menu-item\[aria-current='page'\]/)
})

test('sidebar pins account identity and settings to one bottom row', async () => {
  const [sidebar, sidebarCss] = await Promise.all([
    readFile(
      new URL('../src/renderer/src/components/Sidebar/Sidebar.tsx', import.meta.url),
      'utf8'
    ),
    readFile(new URL('../src/renderer/src/components/Sidebar/Sidebar.css', import.meta.url), 'utf8')
  ])

  assert.match(sidebar, /Settings/)
  assert.doesNotMatch(sidebar, /UserRound/)
  assert.match(sidebar, /className="studio-sidebar__user"/)
  assert.match(sidebar, /className="studio-sidebar__avatar"[^>]*>\s*KA\s*</)
  assert.match(sidebar, /className="studio-sidebar__identity"/)
  assert.match(sidebar, /<span className="studio-sidebar__nickname">kasixmb<\/span>/)
  assert.match(sidebar, /<span className="studio-sidebar__plan">Plus<\/span>/)
  assert.match(sidebar, /aria-label="设置"/)
  assert.match(
    sidebarCss,
    /\.studio-sidebar\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s
  )
  assert.match(
    sidebarCss,
    /\.studio-sidebar__user\s*{[^}]*display:\s*flex;[^}]*margin-top:\s*auto;/s
  )
  assert.match(
    sidebarCss,
    /\.studio-sidebar__nickname,\s*\.studio-sidebar__plan\s*{[^}]*text-overflow:\s*ellipsis;/s
  )
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

test('outer side panels start at their minimum widths', async () => {
  const layout = await readFile(
    new URL('../src/renderer/src/layouts/Layout.tsx', import.meta.url),
    'utf8'
  )

  assert.match(
    layout,
    /<Panel\s+id="sidebar"\s+defaultSize=\{160\}\s+minSize=\{160\}[^>]*groupResizeBehavior="preserve-pixel-size"/s
  )
  assert.match(
    layout,
    /<Panel\s+id="ai-panel"\s+defaultSize=\{260\}\s+minSize=\{260\}[^>]*groupResizeBehavior="preserve-pixel-size"/s
  )
})

test('workspace columns resize from accessible focusable handles', async () => {
  const [packageJson, layout, layoutCss] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/layouts/Layout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/layouts/Layout.css', import.meta.url), 'utf8')
  ])
  const packageData = JSON.parse(packageJson)

  assert.equal(typeof packageData.dependencies?.['react-resizable-panels'], 'string')
  assert.match(layout, /from 'react-resizable-panels'/)
  assert.match(layout, /className="app-layout"[^>]*orientation="horizontal"/s)
  assert.doesNotMatch(layout, /orientation="vertical"/)
  assert.equal(layout.match(/className="app-layout__resize-handle"/g)?.length, 2)
  assert.match(layout, /minSize=/)
  assert.match(layoutCss, /\.app-layout__resize-handle\s*{[^}]*width:\s*8px/s)
  assert.match(layoutCss, /\.app-layout__resize-handle\s*{[^}]*cursor:\s*col-resize/s)
  assert.match(layoutCss, /\.app-layout__resize-handle::after\s*{[^}]*opacity:\s*0/s)
  assert.match(layoutCss, /\.app-layout__resize-handle:hover::after/)
  assert.match(layoutCss, /\.app-layout__resize-handle:focus-visible::after/)
  assert.match(layoutCss, /\[data-separator='active'\]::after/)
  assert.match(layoutCss, /background:\s*#606060/)
})

test('window uses a gray draggable title bar with native window controls', async () => {
  const [main, app, baseCss, titleBar, titleBarCss] = await Promise.all([
    readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/assets/base.css', import.meta.url), 'utf8'),
    readFile(
      new URL('../src/renderer/src/components/TitleBar/TitleBar.tsx', import.meta.url),
      'utf8'
    ).catch(() => ''),
    readFile(
      new URL('../src/renderer/src/components/TitleBar/TitleBar.css', import.meta.url),
      'utf8'
    ).catch(() => '')
  ])

  assert.match(main, /titleBarStyle:\s*'hidden'/)
  assert.match(main, /titleBarOverlay:\s*{[^}]*color:\s*'#e8e8e8'/s)
  assert.match(main, /titleBarOverlay:\s*{[^}]*symbolColor:\s*'#1f1f1f'/s)
  assert.match(main, /titleBarOverlay:\s*{[^}]*height:\s*32/s)
  assert.match(app, /import TitleBar from '.\/components\/TitleBar\/TitleBar'/)
  assert.match(app, /<TitleBar\s*\/>/)
  assert.match(baseCss, /#root\s*{[^}]*padding-top:\s*32px/s)
  assert.match(
    titleBar,
    /<span>文件<\/span>\s*<span>编辑<\/span>\s*<span>查看<\/span>\s*<span>帮助<\/span>/
  )
  assert.match(titleBarCss, /position:\s*fixed/)
  assert.match(titleBarCss, /height:\s*32px/)
  assert.match(titleBarCss, /background:\s*#e8e8e8/)
  assert.match(titleBarCss, /-webkit-app-region:\s*drag/)
})

test('development login enters the workspace without removing production authentication', async () => {
  const app = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')

  assert.match(
    app,
    /if\s*\(import\.meta\.env\.DEV\)\s*{[^}]*setCurrentView\('workspace'\)[^}]*return/s
  )
  assert.match(app, /const result = await window\.api\.login\(/)
})
