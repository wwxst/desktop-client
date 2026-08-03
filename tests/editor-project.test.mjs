import assert from 'node:assert/strict'
import test from 'node:test'

async function loadEditorProject() {
  try {
    return await import('../src/renderer/src/components/WorkspaceView/editorProject.ts')
  } catch (error) {
    assert.fail(`editorProject module should load: ${error.message}`)
  }
}

function readyAsset(id, name = `${id}.mp4`) {
  return { id, name, url: `file:///${id}.mp4`, duration: null, status: 'loading' }
}

test('adds a ready asset once, creates and activates its clip, and selects it', async () => {
  const project = await loadEditorProject()
  let state = project.createInitialEditorProjectState('row-1')
  state = project.editorProjectReducer(state, { type: 'assets/imported', asset: readyAsset('asset-1') })
  state = project.editorProjectReducer(state, { type: 'asset/ready', assetId: 'asset-1', duration: 12.5 })
  const added = project.editorProjectReducer(state, { type: 'timeline/assetAdded', assetId: 'asset-1' })

  assert.equal(added.clips.length, 1)
  assert.equal(added.clips[0].assetId, 'asset-1')
  assert.equal(added.activeClipId, added.clips[0].id)
  assert.deepEqual(project.selectActiveAsset(added), {
    ...readyAsset('asset-1'),
    duration: 12.5,
    status: 'ready'
  })
  assert.strictEqual(project.editorProjectReducer(added, { type: 'timeline/assetAdded', assetId: 'asset-1' }), added)
})

test('appends clips in add order and changes active asset when an existing clip is selected', async () => {
  const project = await loadEditorProject()
  let state = project.createInitialEditorProjectState('row-1')
  for (const id of ['asset-1', 'asset-2']) {
    state = project.editorProjectReducer(state, { type: 'assets/imported', asset: readyAsset(id) })
    state = project.editorProjectReducer(state, { type: 'asset/ready', assetId: id, duration: 8 })
    state = project.editorProjectReducer(state, { type: 'timeline/assetAdded', assetId: id })
  }

  assert.deepEqual(state.clips.map((clip) => clip.assetId), ['asset-1', 'asset-2'])
  assert.equal(project.selectActiveAsset(state).id, 'asset-2')
  const selected = project.editorProjectReducer(state, { type: 'timeline/clipSelected', clipId: state.clips[0].id })
  assert.equal(selected.activeClipId, state.clips[0].id)
  assert.equal(project.selectActiveAsset(selected).id, 'asset-1')
  assert.strictEqual(project.editorProjectReducer(selected, { type: 'timeline/clipSelected', clipId: 'missing' }), selected)
})

test('only adds ready existing assets and records ready durations and failed errors immutably', async () => {
  const project = await loadEditorProject()
  let state = project.createInitialEditorProjectState('row-1')
  state = project.editorProjectReducer(state, { type: 'assets/imported', asset: readyAsset('asset-1') })
  assert.strictEqual(project.editorProjectReducer(state, { type: 'timeline/assetAdded', assetId: 'asset-1' }), state)
  assert.strictEqual(project.editorProjectReducer(state, { type: 'timeline/assetAdded', assetId: 'missing' }), state)
  const ready = project.editorProjectReducer(state, { type: 'asset/ready', assetId: 'asset-1', duration: 4 })
  assert.notStrictEqual(ready, state)
  assert.deepEqual(ready.assets[0], { ...readyAsset('asset-1'), duration: 4, status: 'ready' })
  const failed = project.editorProjectReducer(ready, { type: 'asset/failed', assetId: 'asset-1', error: 'cannot decode' })
  assert.equal(failed.assets[0].status, 'error')
  assert.equal(failed.assets[0].error, 'cannot decode')
})

test('inserts, updates, and deletes draft rows while retaining at least one row', async () => {
  const project = await loadEditorProject()
  let state = project.createInitialEditorProjectState('row-1')
  state = project.editorProjectReducer(state, { type: 'draft/rowAdded', rowId: 'row-2', afterRowId: 'row-1' })
  assert.deepEqual(state.draftRows.map((row) => row.id), ['row-1', 'row-2'])
  state = project.editorProjectReducer(state, {
    type: 'draft/rowUpdated',
    rowId: 'row-2',
    changes: { draftName: 'Chapter 2', audio: 'narration.mp3' }
  })
  assert.deepEqual(state.draftRows[1], {
    id: 'row-2',
    draftName: 'Chapter 2',
    fixedStartFileName: '',
    audio: 'narration.mp3',
    fixedEndFileName: ''
  })
  state = project.editorProjectReducer(state, { type: 'draft/rowDeleted', rowId: 'row-1' })
  assert.deepEqual(state.draftRows.map((row) => row.id), ['row-2'])
  assert.strictEqual(project.editorProjectReducer(state, { type: 'draft/rowDeleted', rowId: 'row-2' }), state)
})

test('starts with a 9:16 canvas and updates its selected aspect ratio', async () => {
  const project = await loadEditorProject()
  const initial = project.createInitialEditorProjectState('row-1')
  assert.deepEqual(initial.aspectRatio, project.DEFAULT_CANVAS_ASPECT_RATIO)
  assert.deepEqual(initial.aspectRatio, { id: '9:16', label: '抖音', width: 9, height: 16 })
  const selected = project.editorProjectReducer(initial, {
    type: 'aspectRatio/selected',
    aspectRatio: { id: '16:9', label: '横屏', width: 16, height: 9 }
  })
  assert.deepEqual(selected.aspectRatio, { id: '16:9', label: '横屏', width: 16, height: 9 })
})
