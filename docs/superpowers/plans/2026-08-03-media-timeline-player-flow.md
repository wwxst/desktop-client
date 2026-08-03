# Media Timeline Player Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect imported media to a real timeline clip and make the player preview and play the currently selected clip while preserving the existing workspace layout and draft table.

**Architecture:** Add a pure `editorProjectReducer` owned by `WorkspaceView`; pass project data and commands into `FunctionPanel`, `Timeline`, and `PlayerPanel` through explicit props. Keep transient UI state inside each panel, keep browser object URLs scoped to the workspace lifetime, and do not add a global store or Electron IPC.

**Tech Stack:** React 19, TypeScript 5.9, Electron 39, Vite, Node 24 test runner, CSS, Lucide React

---

## File Structure

- Create `src/renderer/src/components/WorkspaceView/editorProject.ts`: domain types, initial state, pure reducer, and active-asset selector.
- Create `tests/editor-project.test.mjs`: reducer behavior tests.
- Modify `src/renderer/src/components/WorkspaceView/WorkspaceView.tsx`: reducer ownership, object URL lifetime, IDs, and cross-panel callbacks.
- Modify `src/renderer/src/components/WorkspaceView/FunctionPanel.tsx`: controlled media library and media callbacks.
- Modify `src/renderer/src/components/WorkspaceView/Timeline.tsx`: controlled clips and draft rows.
- Modify `src/renderer/src/components/WorkspaceView/Timeline.css`: compact horizontal clip lane above the table.
- Modify `src/renderer/src/components/WorkspaceView/PlayerPanel.tsx`: selected-asset preview and playback.
- Modify `src/renderer/src/components/WorkspaceView/WorkspaceView.css`: selected-video canvas fit.
- Modify `tests/workspace-player.test.mjs` and `tests/workspace-timeline.test.mjs`: data-flow and UI contracts.

### Task 1: Build the Pure Editor Project Model

**Files:**

- Create: `tests/editor-project.test.mjs`
- Create: `src/renderer/src/components/WorkspaceView/editorProject.ts`

- [ ] **Step 1: Write the failing reducer tests**

Create `tests/editor-project.test.mjs`. Import the planned `.ts` module directly; Node 24 strips erasable TypeScript syntax. Cover the following real state transitions with stable string IDs:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

const projectModule = await import(
  '../src/renderer/src/components/WorkspaceView/editorProject.ts'
).catch(() => null)

const requireExport = (name) => (...args) => {
  assert.ok(projectModule, 'editorProject.ts should be importable')
  assert.equal(typeof projectModule[name], 'function', `${name} should be exported`)
  return projectModule[name](...args)
}

const createDraftRow = requireExport('createDraftRow')
const createInitialEditorProjectState = requireExport('createInitialEditorProjectState')
const editorProjectReducer = requireExport('editorProjectReducer')
const selectActiveAsset = requireExport('selectActiveAsset')

const readyAsset = (id, name) => ({
  id,
  name,
  url: `blob:${id}`,
  duration: 12.5,
  status: 'ready'
})

test('adds a ready asset once and selects its timeline clip', () => {
  let state = createInitialEditorProjectState('draft-1')
  state = editorProjectReducer(state, {
    type: 'assets/imported',
    assets: [readyAsset('asset-1', 'first.mp4')]
  })
  state = editorProjectReducer(state, {
    type: 'timeline/assetAdded',
    assetId: 'asset-1',
    clipId: 'clip-1'
  })

  assert.deepEqual(state.clips, [{ id: 'clip-1', assetId: 'asset-1' }])
  assert.equal(state.activeClipId, 'clip-1')
  assert.equal(selectActiveAsset(state)?.name, 'first.mp4')

  const duplicate = editorProjectReducer(state, {
    type: 'timeline/assetAdded',
    assetId: 'asset-1',
    clipId: 'clip-duplicate'
  })
  assert.strictEqual(duplicate, state)
})

test('appends clips in add order and switches the active clip', () => {
  let state = createInitialEditorProjectState('draft-1')
  state = editorProjectReducer(state, {
    type: 'assets/imported',
    assets: [readyAsset('asset-1', 'first.mp4'), readyAsset('asset-2', 'second.mp4')]
  })
  state = editorProjectReducer(state, {
    type: 'timeline/assetAdded', assetId: 'asset-1', clipId: 'clip-1'
  })
  state = editorProjectReducer(state, {
    type: 'timeline/assetAdded', assetId: 'asset-2', clipId: 'clip-2'
  })
  assert.deepEqual(state.clips.map((clip) => clip.id), ['clip-1', 'clip-2'])
  assert.equal(state.activeClipId, 'clip-2')

  state = editorProjectReducer(state, {
    type: 'timeline/clipSelected', clipId: 'clip-1'
  })
  assert.equal(selectActiveAsset(state)?.id, 'asset-1')
})

test('rejects unreadable assets and updates readiness', () => {
  let state = createInitialEditorProjectState('draft-1')
  state = editorProjectReducer(state, {
    type: 'assets/imported',
    assets: [{
      id: 'asset-loading', name: 'loading.mp4', url: 'blob:loading',
      duration: null, status: 'loading'
    }]
  })
  const rejected = editorProjectReducer(state, {
    type: 'timeline/assetAdded', assetId: 'asset-loading', clipId: 'clip-loading'
  })
  assert.strictEqual(rejected, state)

  state = editorProjectReducer(state, {
    type: 'asset/ready', assetId: 'asset-loading', duration: 9.75
  })
  assert.deepEqual(
    { status: state.assets[0]?.status, duration: state.assets[0]?.duration },
    { status: 'ready', duration: 9.75 }
  )
  state = editorProjectReducer(state, {
    type: 'asset/failed', assetId: 'asset-loading'
  })
  assert.equal(state.assets[0]?.status, 'error')
})

test('keeps at least one controlled draft row', () => {
  let state = createInitialEditorProjectState('draft-1')
  state = editorProjectReducer(state, {
    type: 'draft/rowAdded', afterRowId: 'draft-1', row: createDraftRow('draft-2')
  })
  state = editorProjectReducer(state, {
    type: 'draft/rowUpdated', rowId: 'draft-2', updates: { draftName: '第二条草稿' }
  })
  assert.equal(state.draftRows[1]?.draftName, '第二条草稿')

  state = editorProjectReducer(state, { type: 'draft/rowDeleted', rowId: 'draft-1' })
  const oneRow = editorProjectReducer(state, {
    type: 'draft/rowDeleted', rowId: 'draft-2'
  })
  assert.strictEqual(oneRow, state)
})

test('defaults to 9:16 and stores a selected canvas ratio', () => {
  let state = createInitialEditorProjectState('draft-1')
  assert.equal(state.aspectRatio.id, '9:16')

  state = editorProjectReducer(state, {
    type: 'aspectRatio/selected',
    aspectRatio: { id: '16:9', label: '16:9（西瓜视频）', width: 16, height: 9 }
  })
  assert.equal(state.aspectRatio.id, '16:9')
})
```

- [ ] **Step 2: Run the reducer tests and verify RED**

Run `node --test tests/editor-project.test.mjs`.

Expected: FAIL with `editorProject.ts should be importable`; this proves the test is failing on the missing feature rather than crashing during module loading.

- [ ] **Step 3: Implement the minimal project model**

Create these types and defaults:

```ts
export type MediaAssetStatus = 'loading' | 'ready' | 'error'

export interface MediaAsset {
  id: string
  name: string
  url: string
  duration: number | null
  status: MediaAssetStatus
}

export interface TimelineClip { id: string; assetId: string }
export interface CanvasAspectRatio { id: string; label: string; width: number; height: number }
export interface DraftRow {
  id: string
  draftName: string
  fixedStartFileName: string
  audio: string
  fixedEndFileName: string
}

export interface EditorProjectState {
  assets: MediaAsset[]
  clips: TimelineClip[]
  activeClipId: string | null
  aspectRatio: CanvasAspectRatio
  draftRows: DraftRow[]
}

export const DEFAULT_CANVAS_ASPECT_RATIO = {
  id: '9:16', label: '9:16（抖音）', width: 9, height: 16
} satisfies CanvasAspectRatio

export const createDraftRow = (id: string): DraftRow => ({
  id,
  draftName: '',
  fixedStartFileName: '选择视频',
  audio: '',
  fixedEndFileName: '选择视频'
})
```

Add a discriminated `EditorProjectAction` union and a pure `editorProjectReducer`. Enforce these exact rules: only ready assets can be added; the same asset cannot create two clips; successful additions append and become active; only existing clips can be selected; draft insertion happens immediately after the requested row; the last draft row cannot be deleted. Export `createInitialEditorProjectState(draftRowId)` and `selectActiveAsset(state)`.

- [ ] **Step 4: Run the reducer tests and verify GREEN**

Run `node --test tests/editor-project.test.mjs`.

Expected: 5 tests pass, 0 fail.

- [ ] **Step 5: Commit the model**

```powershell
git add src/renderer/src/components/WorkspaceView/editorProject.ts tests/editor-project.test.mjs
git commit -m "feat: 添加编辑项目状态模型"
```

### Task 2: Lift Media State Into WorkspaceView

**Files:**

- Modify: `tests/workspace-player.test.mjs`
- Modify: `src/renderer/src/components/WorkspaceView/WorkspaceView.tsx`
- Modify: `src/renderer/src/components/WorkspaceView/FunctionPanel.tsx`

- [ ] **Step 1: Add failing ownership assertions**

Extend `tests/workspace-player.test.mjs` with:

```js
assert.match(workspaceSource, /useReducer\(editorProjectReducer/)
assert.match(workspaceSource, /URL\.revokeObjectURL\(url\)/)
assert.match(functionPanelSource, /URL\.createObjectURL\(file\)/)
assert.match(workspaceSource, /<FunctionPanel[\s\S]*mediaItems=\{project\.assets\}/)
assert.match(workspaceSource, /onImportMedia=\{handleImportMedia\}/)
assert.match(workspaceSource, /onAddMedia=\{handleAddMedia\}/)
assert.match(functionPanelSource, /interface FunctionPanelProps/)
assert.doesNotMatch(functionPanelSource, /useState<MediaItem\[\]>/)
assert.doesNotMatch(functionPanelSource, /setAddedMediaIds/)
assert.match(functionPanelSource, /disabled=\{isAdded \|\| mediaItem\.status !== 'ready'\}/)
```

- [ ] **Step 2: Run focused tests and verify RED**

Run `node --test tests/editor-project.test.mjs tests/workspace-player.test.mjs`.

Expected: reducer tests pass; the new workspace assertions fail because `FunctionPanel` still owns independent arrays.

- [ ] **Step 3: Convert FunctionPanel to controlled props**

Replace local asset, added, ready, failed, URL, and numeric-ID state with:

```ts
interface FunctionPanelProps {
  mediaItems: MediaAsset[]
  addedMediaIds: ReadonlySet<string>
  onImportMedia: (assets: MediaAsset[]) => void
  onMediaReady: (mediaId: string, duration: number) => void
  onMediaError: (mediaId: string) => void
  onAddMedia: (mediaId: string) => void
}
```

The file-input handler converts each selected `File` into a loading `MediaAsset` with `crypto.randomUUID()` and `URL.createObjectURL(file)`, calls `onImportMedia(assets)`, and clears the input. Derive card readiness from `mediaItem.status`; call `onMediaReady(mediaItem.id, event.currentTarget.duration)` from `onLoadedData`, call `onMediaError` from `onError`, and disable Add when the item is already added or not ready. Preserve category dragging, current labels, thumbnail geometry, and CSP-dependent `blob:` preview.

- [ ] **Step 4: Own reducer state and URL lifetime in WorkspaceView**

Initialize the reducer once and register every reported asset URL:

```ts
const [project, dispatch] = useReducer(
  editorProjectReducer,
  undefined,
  () => createInitialEditorProjectState(crypto.randomUUID())
)
const mediaUrlsRef = useRef(new Set<string>())

useEffect(() => {
  const mediaUrls = mediaUrlsRef.current
  return () => mediaUrls.forEach((url) => URL.revokeObjectURL(url))
}, [])

const handleImportMedia = (assets: MediaAsset[]): void => {
  if (assets.length === 0) return
  assets.forEach((asset) => mediaUrlsRef.current.add(asset.url))
  dispatch({ type: 'assets/imported', assets })
}
```

Dispatch `asset/ready`, `asset/failed`, and `timeline/assetAdded` from stable handlers. Derive `addedMediaIds` from `project.clips` with `useMemo`. Pass all controlled values and handlers to `FunctionPanel`.

- [ ] **Step 5: Verify media ownership is GREEN**

Run:

```powershell
node --test tests/editor-project.test.mjs tests/workspace-player.test.mjs
npm run typecheck:web
```

Expected: focused tests and renderer type checking pass.

- [ ] **Step 6: Commit controlled media state**

```powershell
git add src/renderer/src/components/WorkspaceView/WorkspaceView.tsx src/renderer/src/components/WorkspaceView/FunctionPanel.tsx tests/workspace-player.test.mjs
git commit -m "refactor: 集中管理工作区媒体状态"
```

### Task 3: Render Timeline Clips Above the Draft Form

**Files:**

- Modify: `tests/workspace-timeline.test.mjs`
- Modify: `src/renderer/src/components/WorkspaceView/Timeline.tsx`
- Modify: `src/renderer/src/components/WorkspaceView/Timeline.css`
- Modify: `src/renderer/src/components/WorkspaceView/WorkspaceView.tsx`

- [ ] **Step 1: Add failing clip-lane assertions**

Add these requirements while retaining every existing four-column, upload, row-action, and no-vertical-border assertion:

```js
assert.match(timelineSource, /interface TimelineProps/)
assert.match(timelineSource, /className="studio-timeline__clip-lane"/)
assert.match(timelineSource, /aria-label="时间线素材"/)
assert.match(timelineSource, /clips\.map\(\(clip\) =>/)
assert.match(timelineSource, /aria-pressed=\{activeClipId === clip\.id\}/)
assert.match(timelineSource, /onClick=\{\(\) => onSelectClip\(clip\.id\)\}/)
assert.doesNotMatch(timelineSource, /const \[rows, setRows\] = useState/)
assert.match(workspaceSource, /<Timeline[\s\S]*clips=\{project\.clips\}/)
assert.match(timelineStyles, /grid-template-rows:\s*56px minmax\(0, 1fr\)/)
assert.match(timelineStyles, /\.studio-timeline__clip\[aria-pressed='true'\]/)
```

- [ ] **Step 2: Run timeline tests and verify RED**

Run `node --test tests/workspace-timeline.test.mjs`.

Expected: clip-lane and controlled-row assertions fail while the existing form assertions pass.

- [ ] **Step 3: Convert Timeline to controlled project props**

Use:

```ts
interface TimelineProps {
  clips: TimelineClip[]
  assets: MediaAsset[]
  activeClipId: string | null
  rows: DraftRow[]
  onSelectClip: (clipId: string) => void
  onUpdateRow: (rowId: string, updates: Partial<Omit<DraftRow, 'id'>>) => void
  onAddRow: (afterRowId: string) => void
  onDeleteRow: (rowId: string) => void
}
```

Build an `assetsById` map and render this lane before the current table container:

```tsx
<div className="studio-timeline__clip-lane">
  <ol aria-label="时间线素材">
    {clips.map((clip) => {
      const asset = assetsById.get(clip.assetId)
      if (!asset) return null

      return (
        <li key={clip.id}>
          <button
            className="studio-timeline__clip"
            type="button"
            aria-pressed={activeClipId === clip.id}
            onClick={() => onSelectClip(clip.id)}
          >
            <Video size={14} strokeWidth={1.7} aria-hidden="true" />
            <span title={asset.name}>{asset.name}</span>
            <time>{formatDuration(asset.duration)}</time>
          </button>
        </li>
      )
    })}
  </ol>
</div>
```

Keep the current table markup and input names. Replace local updates with supplied callbacks; Add calls `onAddRow(row.id)` and Delete calls `onDeleteRow(row.id)`.

- [ ] **Step 4: Add fixed, horizontally scrollable lane styling**

Use the current neutral palette and compact geometry:

```css
.studio-timeline {
  display: grid;
  grid-template-rows: 56px minmax(0, 1fr);
}

.studio-timeline__clip-lane {
  min-width: 0;
  padding: 8px 12px;
  overflow-x: auto;
  background: #f1f1f1;
  border-bottom: 1px solid #d8d8d8;
}

.studio-timeline__clip-lane ol {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: min-content;
  min-height: 39px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.studio-timeline__clip {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
  width: 164px;
  height: 38px;
  padding: 0 8px;
  color: #4d4d4d;
  background: #ffffff;
  border: 1px solid #cfcfcf;
  border-radius: 4px;
}

.studio-timeline__clip[aria-pressed='true'] {
  color: #086f77;
  background: #e8f1f1;
  border-color: #63a2a7;
}
```

Set `.studio-timeline__table-container` to `height: auto; min-height: 0;`. Retain its 12px padding, scrolling, table column widths, upload controls, and absence of vertical borders.

- [ ] **Step 5: Wire timeline and draft actions in WorkspaceView**

Pass `project.clips`, `project.assets`, `project.activeClipId`, and `project.draftRows`. Dispatch `timeline/clipSelected`, `draft/rowUpdated`, `draft/rowAdded` with `createDraftRow(crypto.randomUUID())`, and `draft/rowDeleted` from callbacks.

- [ ] **Step 6: Verify timeline behavior is GREEN**

Run:

```powershell
node --test tests/editor-project.test.mjs tests/workspace-timeline.test.mjs
npm run typecheck:web
```

Expected: reducer and timeline tests pass; renderer type checking passes.

- [ ] **Step 7: Commit the timeline lane**

```powershell
git add src/renderer/src/components/WorkspaceView/WorkspaceView.tsx src/renderer/src/components/WorkspaceView/Timeline.tsx src/renderer/src/components/WorkspaceView/Timeline.css tests/workspace-timeline.test.mjs
git commit -m "feat: 将媒体添加到时间线"
```

### Task 4: Preview and Play the Active Timeline Clip

**Files:**

- Modify: `tests/workspace-player.test.mjs`
- Modify: `src/renderer/src/components/WorkspaceView/PlayerPanel.tsx`
- Modify: `src/renderer/src/components/WorkspaceView/WorkspaceView.tsx`
- Modify: `src/renderer/src/components/WorkspaceView/WorkspaceView.css`

- [ ] **Step 1: Add failing real-player assertions**

Replace the old always-empty and always-disabled expectations with:

```js
assert.match(playerPanelSource, /interface PlayerPanelProps/)
assert.match(playerPanelSource, /activeAsset:\s*MediaAsset \| null/)
assert.match(playerPanelSource, /selectedRatio:\s*CanvasAspectRatio/)
assert.match(playerPanelSource, /<video/)
assert.match(playerPanelSource, /src=\{activeAsset\.url\}/)
assert.match(playerPanelSource, /preload="auto"/)
assert.match(playerPanelSource, /onLoadedData=/)
assert.match(playerPanelSource, /onTimeUpdate=/)
assert.match(playerPanelSource, /videoRef\.current\.play\(\)/)
assert.match(playerPanelSource, /videoRef\.current\.pause\(\)/)
assert.match(playerPanelSource, /currentTime = 0/)
assert.match(playerPanelSource, /disabled=\{!activeAsset \|\| !isVideoReady\}/)
assert.match(playerPanelSource, /isPlaying \? '暂停' : '播放'/)
assert.match(workspaceSource, /activeAsset=\{activeAsset\}/)
assert.match(workspaceSource, /selectedRatio=\{project\.aspectRatio\}/)
```

Retain the existing ratio menu, centered canvas, responsive sizing, and default `9:16` assertions.

- [ ] **Step 2: Run focused player tests and verify RED**

Run `node --test tests/editor-project.test.mjs tests/workspace-player.test.mjs`.

Expected: new assertions fail because the canvas still renders only the Film placeholder and Play stays disabled.

- [ ] **Step 3: Make ratio state controlled and add playback state**

Use:

```ts
interface PlayerPanelProps {
  activeAsset: MediaAsset | null
  selectedRatio: CanvasAspectRatio
  onAspectRatioChange: (ratio: CanvasAspectRatio) => void
}
```

Remove local `selectedRatio`; keep ratio-menu visibility and custom inputs local. Replace `setSelectedRatio(option)` with `onAspectRatioChange(option)`.

Add `videoRef`, `isVideoReady`, `isPlaying`, `currentTime`, and `duration`. On `activeAsset?.id` change, pause the existing element, set `currentTime = 0` when possible, and reset playback state. Render:

```tsx
{activeAsset ? (
  <video
    key={activeAsset.id}
    ref={videoRef}
    src={activeAsset.url}
    preload="auto"
    playsInline
    aria-label={`${activeAsset.name}播放器预览`}
    onLoadedData={(event) => {
      event.currentTarget.currentTime = 0
      setDuration(event.currentTarget.duration)
      setIsVideoReady(true)
    }}
    onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
    onPlay={() => setIsPlaying(true)}
    onPause={() => setIsPlaying(false)}
    onEnded={() => setIsPlaying(false)}
    onError={() => {
      setIsVideoReady(false)
      setIsPlaying(false)
    }}
  />
) : (
  <Film size={34} strokeWidth={1.4} aria-hidden="true" />
)}
```

Implement `togglePlayback` with `await videoRef.current.play()` inside `try/catch` and `videoRef.current.pause()` for the playing path. The center button calls `void togglePlayback()`, switches between Lucide `Play` and `Pause`, updates label/title, and is disabled only without an asset or before readiness. Format both time values as `HH:MM:SS` using floored non-negative finite seconds.

- [ ] **Step 4: Fit video inside the current ratio canvas**

Add only:

```css
.studio-player__canvas video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #111111;
}
```

Do not change stage centering, ratio sizing formulas, default `9:16`, outer panels, sidebar, or AI panel.

- [ ] **Step 5: Pass active asset and project ratio from WorkspaceView**

Derive `const activeAsset = selectActiveAsset(project)`. Pass it and `project.aspectRatio` into `PlayerPanel`, and dispatch `aspectRatio/selected` from `onAspectRatioChange`.

- [ ] **Step 6: Verify player behavior is GREEN**

Run:

```powershell
node --test tests/editor-project.test.mjs tests/workspace-player.test.mjs tests/workspace-timeline.test.mjs
npm run typecheck:web
```

Expected: focused tests and renderer type checking pass.

- [ ] **Step 7: Commit player linkage**

```powershell
git add src/renderer/src/components/WorkspaceView/WorkspaceView.tsx src/renderer/src/components/WorkspaceView/PlayerPanel.tsx src/renderer/src/components/WorkspaceView/WorkspaceView.css tests/workspace-player.test.mjs
git commit -m "feat: 联动时间线与视频播放器"
```

### Task 5: Full Verification and Real MP4 Check

**Files:**

- Verify: all files changed in Tasks 1-4

- [ ] **Step 1: Run the complete suite**

Run `npm test`.

Expected: all tests pass with 0 failures.

- [ ] **Step 2: Run static verification**

Run each command independently:

```powershell
npm run lint -- --quiet
npm run typecheck
npm run build
git diff --check
```

Expected: every command exits with code 0 and emits no lint, type, build, or whitespace errors.

- [ ] **Step 3: Inspect scope**

Run:

```powershell
git diff --stat 6693204..HEAD
git status --short
```

Expected: only the editor project model, `WorkspaceView` children/styles, focused tests, and this plan changed. `Sidebar`, `Layout`, `AiPanel`, `src/main`, and `src/preload` are absent.

- [ ] **Step 4: Verify the real workflow**

Run the Electron development app and use MP4 files from `C:\Users\Administrator\Videos\1111111111`:

1. Import one video; only the media card changes.
2. Click “添加”; exactly one selected clip appears in the timeline lane.
3. The player displays the first frame without autoplay.
4. Play advances time; Pause stops it.
5. Add a second video and switch clips; every switch pauses and returns to the first frame.
6. The four-column draft form, menu sidebar, AI panel, and minimum default outer widths remain unchanged.

- [ ] **Step 5: Record final state**

```powershell
git log -5 --oneline --decorate
git status --short --branch
```

Expected: implementation commits are present and the worktree is clean. Do not push unless the user explicitly requests it.
