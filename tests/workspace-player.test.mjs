import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workspaceSource = await readFile(
  new URL('../src/renderer/src/components/WorkspaceView/WorkspaceView.tsx', import.meta.url),
  'utf8'
)
const workspaceStyles = await readFile(
  new URL('../src/renderer/src/components/WorkspaceView/WorkspaceView.css', import.meta.url),
  'utf8'
)
const functionPanelSource = await readFile(
  new URL('../src/renderer/src/components/WorkspaceView/FunctionPanel.tsx', import.meta.url),
  'utf8'
).catch(() => '')
const parameterPanelSource = await readFile(
  new URL('../src/renderer/src/components/WorkspaceView/ParameterPanel.tsx', import.meta.url),
  'utf8'
).catch(() => '')
const playerPanelSource = await readFile(
  new URL('../src/renderer/src/components/WorkspaceView/PlayerPanel.tsx', import.meta.url),
  'utf8'
).catch(() => '')
const rendererHtml = await readFile(new URL('../src/renderer/index.html', import.meta.url), 'utf8')

test('renders the light player with an enabled ratio control', () => {
  assert.match(playerPanelSource, /<section[^>]*className="studio-player"[^>]*aria-label="播放器"/s)
  assert.match(playerPanelSource, /<h2>播放器<\/h2>/)
  assert.match(playerPanelSource, /className="studio-player__stage"/)
  assert.match(playerPanelSource, /className="studio-player__canvas"/)
  assert.match(playerPanelSource, /暂无预览内容，画面比例/)
  assert.match(playerPanelSource, /className="studio-player__controls" aria-label="播放控制"/)
  assert.match(playerPanelSource, /disabled=\{!isActiveAssetReady \|\| !isVideoReady\}/)
  assert.match(playerPanelSource, /aria-label="全屏"[^>]*disabled/)
  assert.match(playerPanelSource, /aria-label="画面比例"[^>]*aria-expanded=/s)
  assert.doesNotMatch(playerPanelSource, /aria-label="画面比例"[^>]*disabled/s)
})

test('keeps the function player parameter and timeline regions inside WorkspaceView', () => {
  assert.match(workspaceSource, /from 'react-resizable-panels'/)
  assert.match(workspaceSource, /import Timeline from '.\/Timeline'/)
  assert.match(workspaceSource, /import FunctionPanel from '.\/FunctionPanel'/)
  assert.match(workspaceSource, /import ParameterPanel from '.\/ParameterPanel'/)
  assert.match(workspaceSource, /import PlayerPanel from '.\/PlayerPanel'/)
  assert.match(workspaceSource, /<section className="studio-workspace" aria-label="剪辑工作区">/)
  assert.match(workspaceSource, /className="studio-workspace__rows"[^>]*orientation="vertical"/s)
  assert.match(
    workspaceSource,
    /className="studio-workspace__columns"[^>]*orientation="horizontal"/s
  )
  assert.match(workspaceSource, /<FunctionPanel/)
  assert.match(workspaceSource, /<PlayerPanel/)
  assert.match(workspaceSource, /<ParameterPanel\s*\/>/)
  assert.match(workspaceSource, /<Timeline/)
  assert.equal(
    workspaceSource.match(/className="studio-workspace__column-resize-handle"/g)?.length,
    2
  )
  assert.equal(workspaceSource.match(/className="studio-workspace__row-resize-handle"/g)?.length, 1)

  assert.match(
    functionPanelSource,
    /<section className="studio-function-panel" aria-label="功能区">/
  )
  assert.doesNotMatch(functionPanelSource, /<h2>功能区<\/h2>/)
  assert.match(
    parameterPanelSource,
    /<section className="studio-parameter-panel" aria-label="参数区">/
  )
  assert.match(parameterPanelSource, /<h2>参数区<\/h2>/)
})

test('renders the light horizontal function category bar', () => {
  for (const label of ['媒体', '音频', '文本', '贴纸', '特效', '转场', '滤镜', '调节', '模板']) {
    assert.match(functionPanelSource, new RegExp(`label: '${label}'`))
  }

  assert.match(functionPanelSource, /useState\('媒体'\)/)
  assert.match(functionPanelSource, /role="tablist"[^>]*aria-label="功能分类"/s)
  assert.match(functionPanelSource, /role="tab"/)
  assert.match(functionPanelSource, /aria-selected=\{selectedCategory === tool\.label\}/)
  assert.match(functionPanelSource, /setSelectedCategory\(tool\.label\)/)
  assert.match(functionPanelSource, /className="studio-function-panel__content"/)
  assert.doesNotMatch(functionPanelSource, /role="tab"[^>]*disabled/s)
  assert.match(functionPanelSource, /handleCategoryPointerDown/)
  assert.match(functionPanelSource, /handleCategoryPointerMove/)
  assert.match(functionPanelSource, /handleCategoryPointerUp/)
  assert.match(functionPanelSource, /handleCategoryWheel/)
  assert.match(functionPanelSource, /scrollLeft/)
  assert.match(functionPanelSource, /data-dragging=\{isDragging\}/)

  assert.match(
    workspaceStyles,
    /\.studio-function-panel__categories\s*{[^}]*display:\s*flex;[^}]*overflow-x:\s*auto;/s
  )
  assert.match(
    workspaceStyles,
    /\.studio-function-panel__categories\s+button\s*{[^}]*flex-direction:\s*column;/s
  )
  assert.match(
    workspaceStyles,
    /\.studio-function-panel__categories\s*{[^}]*cursor:\s*grab;[^}]*touch-action:\s*pan-y;/s
  )
  assert.match(
    workspaceStyles,
    /\.studio-function-panel__categories\[data-dragging='true'\]\s*{[^}]*cursor:\s*grabbing;/s
  )
})

test('renders an importable light media library in the media category', () => {
  assert.match(functionPanelSource, /selectedCategory === '媒体'/)
  assert.match(functionPanelSource, /className="studio-function-panel__media-library"/)
  assert.match(functionPanelSource, /<span>导入<\/span>/)
  assert.match(functionPanelSource, /<h3>全部<\/h3>/)
  assert.match(
    functionPanelSource,
    /<input[^>]*type="file"[^>]*accept="video\/\*"[^>]*multiple[^>]*aria-label="导入媒体"/s
  )
  assert.match(functionPanelSource, /handleMediaImport/)
  assert.match(functionPanelSource, /URL\.createObjectURL/)
  assert.match(workspaceSource, /URL\.revokeObjectURL/)
  assert.match(functionPanelSource, /mediaItems\.map/)
  assert.match(functionPanelSource, /<video/)
  assert.match(functionPanelSource, /onLoadedMetadata=/)
  assert.match(functionPanelSource, /preload="auto"/)
  assert.match(functionPanelSource, /onLoadedData=/)
  assert.match(functionPanelSource, /onError=/)
  assert.match(functionPanelSource, /className="studio-function-panel__media-placeholder"/)
  assert.match(functionPanelSource, /data-ready=\{isPreviewReady\}/)
  assert.match(functionPanelSource, /formatDuration/)
  assert.match(functionPanelSource, /onAddMedia/)
  assert.match(functionPanelSource, /添加/)

  assert.match(
    workspaceStyles,
    /\.studio-function-panel__media-library\s*{[^}]*height:\s*100%;[^}]*overflow:\s*auto;[^}]*background:\s*#f7f7f7;/s
  )
  assert.match(
    workspaceStyles,
    /\.studio-function-panel__media-import\s*{[^}]*display:\s*flex;[^}]*height:\s*28px;/s
  )
  assert.match(workspaceStyles, /\.studio-function-panel__media-grid\s*{[^}]*display:\s*grid;/s)
  assert.match(
    workspaceStyles,
    /\.studio-function-panel__media-thumbnail\s*{[^}]*aspect-ratio:\s*16\s*\/\s*9;/s
  )
  assert.match(
    workspaceStyles,
    /\.studio-function-panel__media-thumbnail video\s*{[^}]*object-fit:\s*cover;/s
  )
  assert.match(
    workspaceStyles,
    /\.studio-function-panel__media-placeholder\s*{[^}]*display:\s*flex;/s
  )
  assert.match(
    workspaceStyles,
    /\.studio-function-panel__media-thumbnail video\[data-ready='true'\]\s*{[^}]*opacity:\s*1;/s
  )
})

test('owns imported media and timeline additions in WorkspaceView', () => {
  assert.match(workspaceSource, /useReducer\(editorProjectReducer/)
  assert.match(workspaceSource, /createInitialEditorProjectState\(crypto\.randomUUID\(\)\)/)
  assert.match(workspaceSource, /URL\.revokeObjectURL\(url\)/)
  assert.match(workspaceSource, /<FunctionPanel[\s\S]*mediaItems=\{project\.assets\}/)
  assert.match(workspaceSource, /addedMediaIds=\{addedMediaIds\}/)
  assert.match(workspaceSource, /onImportMedia=\{handleImportMedia\}/)
  assert.match(workspaceSource, /onMediaReady=\{handleMediaReady\}/)
  assert.match(workspaceSource, /onMediaError=\{handleMediaError\}/)
  assert.match(workspaceSource, /onAddMedia=\{handleAddMedia\}/)

  assert.match(functionPanelSource, /interface FunctionPanelProps/)
  assert.match(functionPanelSource, /mediaItems:\s*MediaAsset\[\]/)
  assert.match(functionPanelSource, /onImportMedia:\s*\(assets:\s*MediaAsset\[\]\) => void/)
  assert.match(functionPanelSource, /URL\.createObjectURL\(file\)/)
  assert.doesNotMatch(functionPanelSource, /useState<MediaItem\[\]>/)
  assert.doesNotMatch(functionPanelSource, /setAddedMediaIds/)
  assert.doesNotMatch(functionPanelSource, /readyMediaIds|failedMediaIds|mediaUrlsRef/)
  assert.match(functionPanelSource, /disabled=\{isAdded \|\| mediaItem\.status !== 'ready'\}/)
})

test('allows imported blob videos through the renderer content security policy', () => {
  assert.match(functionPanelSource, /URL\.createObjectURL\(file\)/)
  assert.match(rendererHtml, /Content-Security-Policy/)
  assert.match(rendererHtml, /media-src\s+'self'\s+blob:/)
})

test('keeps the parameter header and leaves its content empty', () => {
  assert.match(parameterPanelSource, /<h2>参数区<\/h2>/)
  assert.match(parameterPanelSource, /<div className="studio-parameter-panel__content" \/>/)
  assert.doesNotMatch(parameterPanelSource, /role="tab"|<button|<input|<output/)
  assert.match(
    workspaceStyles,
    /\.studio-parameter-panel__content\s*{[^}]*min-height:\s*0;[^}]*background:\s*#f7f7f7;/s
  )
  assert.doesNotMatch(
    workspaceStyles,
    /\.studio-parameter-panel__(?:tabs|section|control|position|range)/
  )
})

test('keeps the player rows and vertical preview stable', () => {
  assert.match(workspaceStyles, /grid-template-rows:\s*40px minmax\(0, 1fr\) 44px/)
  assert.match(workspaceStyles, /grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/)
  assert.match(workspaceStyles, /aspect-ratio:\s*var\(--canvas-aspect-ratio\)/)
  assert.match(workspaceStyles, /background:\s*#f4f4f4/)
})

test('defaults the canvas and ratio menu to the 9:16 Douyin preset', () => {
  assert.match(playerPanelSource, /const DEFAULT_ASPECT_RATIO_ID = '9:16'/)
  assert.match(playerPanelSource, /id: DEFAULT_ASPECT_RATIO_ID,\s*label: '9:16（抖音）'/)
  assert.doesNotMatch(playerPanelSource, /useState<AspectRatioOption>\(DEFAULT_ASPECT_RATIO\)/)
  assert.match(playerPanelSource, /selectedRatio:\s*CanvasAspectRatio/)
  assert.match(playerPanelSource, /aria-checked={selectedRatio\.id === option\.id}/)
  assert.match(playerPanelSource, /--canvas-aspect-ratio/)
  assert.match(playerPanelSource, /--canvas-ratio-value/)
})

test('opens an accessible ratio menu and applies preset or custom ratios', () => {
  for (const label of [
    '16:9（西瓜视频）',
    '4:3',
    '2.35:1',
    '2:1',
    '1.85:1',
    '3:4',
    '5.8寸',
    '1:1'
  ]) {
    assert.match(playerPanelSource, new RegExp(label))
  }

  assert.match(playerPanelSource, /role="menu"[^>]*aria-label="画面比例"/s)
  assert.match(playerPanelSource, /role="menuitemradio"/)
  assert.match(playerPanelSource, /适应（原始）[^]*disabled/s)
  assert.match(playerPanelSource, /onAspectRatioChange\(option\)/)
  assert.match(playerPanelSource, /className="studio-player__ratio-custom"/)
  assert.match(playerPanelSource, /aria-label="自定义宽度"/)
  assert.match(playerPanelSource, /aria-label="自定义高度"/)
  assert.match(playerPanelSource, /applyCustomRatio/)
})

test('closes and navigates the ratio menu from pointer and keyboard input', () => {
  assert.match(playerPanelSource, /addEventListener\('pointerdown'/)
  assert.match(playerPanelSource, /event\.key === 'Escape'/)
  assert.match(playerPanelSource, /event\.key === 'ArrowDown'/)
  assert.match(playerPanelSource, /event\.key !== 'ArrowUp'/)
  assert.match(playerPanelSource, /menuRef\.current\.querySelectorAll<HTMLButtonElement>/)
})

test('fits the centered canvas inside balanced player safe space', () => {
  assert.match(
    workspaceStyles,
    /\.studio-player__stage\s*{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*padding:\s*24px;[^}]*container-type:\s*size;/s
  )
  assert.match(
    workspaceStyles,
    /\.studio-player__canvas\s*{[^}]*width:\s*min\(88cqw,\s*calc\(88cqh \* var\(--canvas-ratio-value\)\)\);/s
  )
})

test('positions the light ratio popover above the player controls', () => {
  assert.match(
    workspaceStyles,
    /\.studio-player__ratio-popover\s*{[^}]*position:\s*absolute;[^}]*right:\s*8px;[^}]*bottom:\s*52px;[^}]*background:\s*#ffffff;/s
  )
  assert.match(
    workspaceStyles,
    /\.studio-player__ratio-option-preview\s*{[^}]*aspect-ratio:\s*var\(--option-ratio\);/s
  )
})

test('keeps the nested workspace groups contained by the middle panel', () => {
  assert.match(
    workspaceStyles,
    /\.studio-workspace\s*{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*min-width:\s*0;[^}]*min-height:\s*0;/s
  )
  assert.match(
    workspaceStyles,
    /\.studio-workspace__rows,\s*\.studio-workspace__top,\s*\.studio-workspace__columns\s*{[^}]*width:\s*100%;[^}]*height:\s*100%;/s
  )
  assert.match(
    workspaceStyles,
    /\.studio-workspace__column-resize-handle\s*{[^}]*cursor:\s*col-resize;/s
  )
  assert.match(
    workspaceStyles,
    /\.studio-workspace__row-resize-handle\s*{[^}]*cursor:\s*row-resize;/s
  )
})

test('keeps player controls readable at default and minimum middle widths', () => {
  assert.match(
    workspaceSource,
    /id="function-panel"[^>]*defaultSize=\{148\}[^>]*minSize=\{112\}[^>]*maxSize=\{240\}[^>]*groupResizeBehavior="preserve-pixel-size"/s
  )
  assert.match(
    workspaceSource,
    /id="parameter-panel"[^>]*defaultSize=\{180\}[^>]*minSize=\{140\}[^>]*maxSize=\{300\}[^>]*groupResizeBehavior="preserve-pixel-size"/s
  )
  assert.doesNotMatch(playerPanelSource, /00:00:00:00/)
  assert.match(workspaceStyles, /\.studio-player\s*{[^}]*container-type:\s*inline-size;/s)
  assert.match(workspaceStyles, /@container \(max-width:\s*300px\)/)
  assert.match(
    workspaceStyles,
    /\.studio-player__time-divider,\s*\.studio-player__controls-left time:not\(\.studio-player__current-time\),\s*\.studio-player__controls-left button\s*{[^}]*display:\s*none;/s
  )
  assert.match(
    workspaceStyles,
    /\.studio-player__controls-right button:first-child\s*{[^}]*display:\s*none;/s
  )
})

test('previews and controls the active timeline video without autoplay', () => {
  assert.match(playerPanelSource, /interface PlayerPanelProps/)
  assert.match(playerPanelSource, /activeAsset:\s*MediaAsset \| null/)
  assert.match(playerPanelSource, /selectedRatio:\s*CanvasAspectRatio/)
  assert.match(playerPanelSource, /onMediaError:\s*\(mediaId:\s*string\) => void/)
  assert.match(playerPanelSource, /activeAsset\?\.status === 'ready'/)
  assert.match(playerPanelSource, /<video/)
  assert.match(playerPanelSource, /src=\{activeAsset\.url\}/)
  assert.match(playerPanelSource, /preload="auto"/)
  assert.doesNotMatch(playerPanelSource, /<video[^>]*autoPlay/s)
  assert.match(playerPanelSource, /onLoadedData=/)
  assert.match(playerPanelSource, /onTimeUpdate=/)
  assert.match(playerPanelSource, /currentTime = 0/)
  assert.match(playerPanelSource, /\.play\(\)/)
  assert.match(playerPanelSource, /\.pause\(\)/)
  assert.match(playerPanelSource, /onMediaError\(activeAsset\.id\)/)
  assert.match(playerPanelSource, /disabled=\{!isActiveAssetReady \|\| !isVideoReady\}/)
  assert.match(playerPanelSource, /isPlaying \? '暂停' : '播放'/)
  assert.match(playerPanelSource, /formatPlaybackTime/)
  assert.match(workspaceSource, /activeAsset=\{activeAsset\}/)
  assert.match(
    workspaceSource,
    /key=\{\s*activeAsset[\s\S]*activeAsset\.id[\s\S]*activeAsset\.status[\s\S]*'empty-player'/
  )
  assert.match(workspaceSource, /selectedRatio=\{project\.aspectRatio\}/)
  assert.match(workspaceSource, /onAspectRatioChange=\{handleAspectRatioChange\}/)
  assert.match(workspaceSource, /<PlayerPanel[\s\S]*onMediaError=\{handleMediaError\}/)
  assert.match(
    workspaceStyles,
    /\.studio-player__canvas video\s*{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*object-fit:\s*contain;[^}]*background:\s*#111111;/s
  )
})
