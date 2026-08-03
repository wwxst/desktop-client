import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const editorProjectSource = await readFile(
  new URL('../src/renderer/src/components/WorkspaceView/editorProject.ts', import.meta.url),
  'utf8'
)
const editorProjectJavaScript = ts.transpileModule(editorProjectSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022
  }
}).outputText
const project = await import(
  `data:text/javascript;base64,${Buffer.from(editorProjectJavaScript).toString('base64')}`
)

const firstAsset = {
  id: 'asset-1',
  name: 'asset-1.mp4',
  url: 'file:///asset-1.mp4',
  duration: null,
  status: 'loading'
}
const secondAsset = {
  id: 'asset-2',
  name: 'asset-2.mp4',
  url: 'file:///asset-2.mp4',
  duration: null,
  status: 'loading'
}

test('adds a ready asset once, creates and activates its clip, and selects it', async () => {
  let state = project.createInitialEditorProjectState('row-1')
  state = project.editorProjectReducer(state, { type: 'assets/imported', asset: firstAsset })
  state = project.editorProjectReducer(state, {
    type: 'asset/ready',
    assetId: 'asset-1',
    duration: 12.5
  })
  const added = project.editorProjectReducer(state, {
    type: 'timeline/assetAdded',
    assetId: 'asset-1'
  })

  assert.equal(added.clips.length, 1)
  assert.equal(added.clips[0].assetId, 'asset-1')
  assert.equal(added.activeClipId, added.clips[0].id)
  assert.deepEqual(project.selectActiveAsset(added), {
    ...firstAsset,
    duration: 12.5,
    status: 'ready'
  })
  assert.strictEqual(
    project.editorProjectReducer(added, { type: 'timeline/assetAdded', assetId: 'asset-1' }),
    added
  )
})

test('appends clips in add order and changes active asset when an existing clip is selected', async () => {
  let state = project.createInitialEditorProjectState('row-1')
  for (const asset of [firstAsset, secondAsset]) {
    state = project.editorProjectReducer(state, { type: 'assets/imported', asset })
    state = project.editorProjectReducer(state, {
      type: 'asset/ready',
      assetId: asset.id,
      duration: 8
    })
    state = project.editorProjectReducer(state, {
      type: 'timeline/assetAdded',
      assetId: asset.id
    })
  }

  assert.deepEqual(
    state.clips.map((clip) => clip.assetId),
    ['asset-1', 'asset-2']
  )
  assert.equal(project.selectActiveAsset(state).id, 'asset-2')
  const selected = project.editorProjectReducer(state, {
    type: 'timeline/clipSelected',
    clipId: state.clips[0].id
  })
  assert.equal(selected.activeClipId, state.clips[0].id)
  assert.equal(project.selectActiveAsset(selected).id, 'asset-1')
  assert.strictEqual(
    project.editorProjectReducer(selected, { type: 'timeline/clipSelected', clipId: 'missing' }),
    selected
  )
})

test('only adds ready existing assets and records ready durations and failed errors immutably', async () => {
  let state = project.createInitialEditorProjectState('row-1')
  state = project.editorProjectReducer(state, { type: 'assets/imported', asset: firstAsset })
  assert.strictEqual(
    project.editorProjectReducer(state, { type: 'timeline/assetAdded', assetId: 'asset-1' }),
    state
  )
  assert.strictEqual(
    project.editorProjectReducer(state, { type: 'timeline/assetAdded', assetId: 'missing' }),
    state
  )
  const ready = project.editorProjectReducer(state, {
    type: 'asset/ready',
    assetId: 'asset-1',
    duration: 4
  })
  assert.notStrictEqual(ready, state)
  assert.deepEqual(ready.assets[0], { ...firstAsset, duration: 4, status: 'ready' })
  const failed = project.editorProjectReducer(ready, {
    type: 'asset/failed',
    assetId: 'asset-1',
    error: 'cannot decode'
  })
  assert.equal(failed.assets[0].status, 'error')
  assert.equal(failed.assets[0].error, 'cannot decode')
})

test('inserts, updates, and deletes draft rows while retaining at least one row', async () => {
  let state = project.createInitialEditorProjectState('row-1')
  state = project.editorProjectReducer(state, {
    type: 'draft/rowAdded',
    rowId: 'row-2',
    afterRowId: 'row-1'
  })
  assert.deepEqual(
    state.draftRows.map((row) => row.id),
    ['row-1', 'row-2']
  )
  state = project.editorProjectReducer(state, {
    type: 'draft/rowUpdated',
    rowId: 'row-2',
    changes: { draftName: 'Chapter 2', audio: 'narration.mp3' }
  })
  assert.deepEqual(state.draftRows[1], {
    id: 'row-2',
    draftName: 'Chapter 2',
    fixedStartFileName: '选择视频',
    audio: 'narration.mp3',
    fixedEndFileName: '选择视频'
  })
  state = project.editorProjectReducer(state, { type: 'draft/rowDeleted', rowId: 'row-1' })
  assert.deepEqual(
    state.draftRows.map((row) => row.id),
    ['row-2']
  )
  assert.strictEqual(
    project.editorProjectReducer(state, { type: 'draft/rowDeleted', rowId: 'row-2' }),
    state
  )
})

test('starts with a 9:16 canvas and updates its selected aspect ratio', async () => {
  const initial = project.createInitialEditorProjectState('row-1')
  assert.deepEqual(initial.aspectRatio, project.DEFAULT_CANVAS_ASPECT_RATIO)
  assert.deepEqual(initial.aspectRatio, { id: '9:16', label: '9:16（抖音）', width: 9, height: 16 })
  const selected = project.editorProjectReducer(initial, {
    type: 'aspectRatio/selected',
    aspectRatio: { id: '16:9', label: '横屏', width: 16, height: 9 }
  })
  assert.deepEqual(selected.aspectRatio, { id: '16:9', label: '横屏', width: 16, height: 9 })
})
