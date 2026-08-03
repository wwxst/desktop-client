export type MediaAssetStatus = 'loading' | 'ready' | 'error'

export interface MediaAsset {
  id: string
  name: string
  url: string
  duration: number | null
  status: MediaAssetStatus
  error?: string
}

export interface TimelineClip {
  id: string
  assetId: string
}

export interface CanvasAspectRatio {
  id: string
  label: string
  width: number
  height: number
}

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

export const DEFAULT_CANVAS_ASPECT_RATIO: CanvasAspectRatio = {
  id: '9:16',
  label: '抖音',
  width: 9,
  height: 16
}

export type EditorProjectAction =
  | { type: 'assets/imported'; asset: MediaAsset }
  | { type: 'asset/ready'; assetId: string; duration: number }
  | { type: 'asset/failed'; assetId: string; error: string }
  | { type: 'timeline/assetAdded'; assetId: string }
  | { type: 'timeline/clipSelected'; clipId: string }
  | { type: 'aspectRatio/selected'; aspectRatio: CanvasAspectRatio }
  | { type: 'draft/rowAdded'; rowId: string; afterRowId: string }
  | { type: 'draft/rowUpdated'; rowId: string; changes: Partial<Omit<DraftRow, 'id'>> }
  | { type: 'draft/rowDeleted'; rowId: string }

export function createDraftRow(id: string): DraftRow {
  return {
    id,
    draftName: '',
    fixedStartFileName: '',
    audio: '',
    fixedEndFileName: ''
  }
}

export function createInitialEditorProjectState(draftRowId: string): EditorProjectState {
  return {
    assets: [],
    clips: [],
    activeClipId: null,
    aspectRatio: DEFAULT_CANVAS_ASPECT_RATIO,
    draftRows: [createDraftRow(draftRowId)]
  }
}

function updateAsset(
  state: EditorProjectState,
  assetId: string,
  update: (asset: MediaAsset) => MediaAsset
): EditorProjectState {
  const assetIndex = state.assets.findIndex((asset) => asset.id === assetId)
  if (assetIndex === -1) return state

  const assets = state.assets.map((asset, index) => (index === assetIndex ? update(asset) : asset))
  return { ...state, assets }
}

function isCanvasAspectRatio(value: CanvasAspectRatio): boolean {
  return (
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    Number.isFinite(value.width) &&
    value.width > 0 &&
    Number.isFinite(value.height) &&
    value.height > 0
  )
}

export function editorProjectReducer(
  state: EditorProjectState,
  action: EditorProjectAction
): EditorProjectState {
  switch (action.type) {
    case 'assets/imported':
      if (state.assets.some((asset) => asset.id === action.asset.id)) return state
      return { ...state, assets: [...state.assets, action.asset] }

    case 'asset/ready':
      return updateAsset(state, action.assetId, (asset) => {
        const { error: _error, ...readyAsset } = asset
        return {
          ...readyAsset,
        duration: action.duration,
          status: 'ready'
        }
      })

    case 'asset/failed':
      return updateAsset(state, action.assetId, (asset) => ({
        ...asset,
        status: 'error',
        error: action.error
      }))

    case 'timeline/assetAdded': {
      const asset = state.assets.find((item) => item.id === action.assetId)
      if (!asset || asset.status !== 'ready' || state.clips.some((clip) => clip.assetId === asset.id)) {
        return state
      }

      const clip = { id: `clip-${asset.id}`, assetId: asset.id }
      return { ...state, clips: [...state.clips, clip], activeClipId: clip.id }
    }

    case 'timeline/clipSelected':
      if (!state.clips.some((clip) => clip.id === action.clipId)) return state
      return state.activeClipId === action.clipId ? state : { ...state, activeClipId: action.clipId }

    case 'aspectRatio/selected':
      if (!isCanvasAspectRatio(action.aspectRatio)) return state
      return { ...state, aspectRatio: action.aspectRatio }

    case 'draft/rowAdded': {
      const afterIndex = state.draftRows.findIndex((row) => row.id === action.afterRowId)
      if (afterIndex === -1 || state.draftRows.some((row) => row.id === action.rowId)) return state

      const draftRows = [...state.draftRows]
      draftRows.splice(afterIndex + 1, 0, createDraftRow(action.rowId))
      return { ...state, draftRows }
    }

    case 'draft/rowUpdated': {
      const rowIndex = state.draftRows.findIndex((row) => row.id === action.rowId)
      if (rowIndex === -1) return state

      const changes = Object.fromEntries(
        Object.entries(action.changes).filter(([key, value]) => key !== 'id' && typeof value === 'string')
      ) as Partial<Omit<DraftRow, 'id'>>
      if (Object.keys(changes).length === 0) return state

      const draftRows = state.draftRows.map((row, index) =>
        index === rowIndex ? { ...row, ...changes } : row
      )
      return { ...state, draftRows }
    }

    case 'draft/rowDeleted':
      if (state.draftRows.length === 1 || !state.draftRows.some((row) => row.id === action.rowId)) {
        return state
      }
      return { ...state, draftRows: state.draftRows.filter((row) => row.id !== action.rowId) }
  }
}

export function selectActiveAsset(state: EditorProjectState): MediaAsset | null {
  const activeClip = state.clips.find((clip) => clip.id === state.activeClipId)
  return activeClip ? state.assets.find((asset) => asset.id === activeClip.assetId) ?? null : null
}
