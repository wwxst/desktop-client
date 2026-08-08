import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Timeline from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/Timeline'
import type {
  DraftRow,
  EditorTrack,
  MediaAsset,
  TimelineClip
} from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorProject'

const asset: MediaAsset = {
  id: 'asset-1',
  name: 'clip.mp4',
  url: 'blob:clip',
  duration: 65,
  status: 'ready'
}
const clip: TimelineClip = { id: 'clip-1', assetId: asset.id }
const row: DraftRow = {
  id: 'row-1',
  draftName: '',
  fixedStartFileName: '选择视频',
  audio: '',
  fixedEndFileName: '选择视频'
}

function renderTimeline(
  rows: DraftRow[] = [row],
  overrides: {
    clips?: TimelineClip[]
    tracks?: EditorTrack[]
    zoom?: number
    onMoveClip?: ReturnType<typeof vi.fn>
    onTrimClip?: ReturnType<typeof vi.fn>
  } = {}
): {
  clips: TimelineClip[]
  assets: MediaAsset[]
  activeClipId: null
  rows: DraftRow[]
  tracks?: EditorTrack[]
  zoom?: number
  onSelectClip: ReturnType<typeof vi.fn>
  onUpdateRow: ReturnType<typeof vi.fn>
  onAddRow: ReturnType<typeof vi.fn>
  onDeleteRow: ReturnType<typeof vi.fn>
  onMoveClip: ReturnType<typeof vi.fn>
  onTrimClip: ReturnType<typeof vi.fn>
} {
  const onMoveClip = overrides.onMoveClip ?? vi.fn()
  const onTrimClip = overrides.onTrimClip ?? vi.fn()
  const props = {
    clips: overrides.clips ?? [clip],
    assets: [asset],
    activeClipId: null,
    rows,
    onSelectClip: vi.fn(),
    onUpdateRow: vi.fn(),
    onAddRow: vi.fn(),
    onDeleteRow: vi.fn(),
    onMoveClip,
    onTrimClip,
    ...overrides
  }
  render(<Timeline {...props} />)
  return props
}

describe('Timeline', () => {
  it('selects a clip through the visible timeline lane', async () => {
    const user = userEvent.setup()
    const { onSelectClip } = renderTimeline()

    await user.click(screen.getByRole('button', { name: /clip.mp4.*01:05/ }))
    expect(onSelectClip).toHaveBeenCalledWith('clip-1')
  })

  it('edits the draft row and uploads fixed media', async () => {
    const user = userEvent.setup()
    const { onUpdateRow } = renderTimeline()

    await user.type(screen.getByRole('textbox', { name: '草稿名' }), '第一章')
    expect(onUpdateRow).toHaveBeenLastCalledWith('row-1', { draftName: '章' })

    const file = new File(['video'], 'opening.mp4', { type: 'video/mp4' })
    await user.upload(screen.getByLabelText('上传固定开头'), file)
    expect(onUpdateRow).toHaveBeenCalledWith('row-1', { fixedStartFileName: 'opening.mp4' })
  })

  it('adds rows and only enables deletion when more than one row exists', async () => {
    const user = userEvent.setup()
    const single = renderTimeline()
    expect(screen.getByRole('button', { name: '删除第 1 行' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '在第 1 行后新增' }))
    expect(single.onAddRow).toHaveBeenCalledWith('row-1')
  })

  it('exposes the zoom-dependent grid size on the timeline canvas', () => {
    const zoom = 144
    renderTimeline([row], { zoom })

    const canvas = document.querySelector<HTMLElement>('.studio-timeline__canvas')
    expect(canvas).not.toBeNull()
    expect(canvas?.style.getPropertyValue('--timeline-grid-size')).toBe(`${zoom}px`)
  })

  it('keeps track headers vertically aligned with the timeline scroll area', () => {
    const tracks: EditorTrack[] = Array.from({ length: 4 }, (_, index) => ({
      id: `track-${index + 1}`,
      name: `V${index + 1}`,
      kind: 'video',
      locked: false,
      hidden: false,
      muted: false
    }))
    renderTimeline([row], { tracks })

    const headers = document.querySelector<HTMLElement>('.studio-timeline__track-headers')
    const scrollArea = document.querySelector<HTMLElement>('.studio-timeline__scroll-area')
    expect(headers).not.toBeNull()
    expect(scrollArea).not.toBeNull()

    Object.defineProperty(scrollArea, 'scrollTop', {
      configurable: true,
      value: 112,
      writable: true
    })
    fireEvent.scroll(scrollArea)

    expect(headers?.scrollTop).toBe(112)
  })

  it('does not let left trim move the clip before timeline zero', () => {
    const onTrimClip = vi.fn()
    const clipAtOneSecond: TimelineClip = {
      ...clip,
      timelineStart: 1,
      duration: 10,
      sourceStart: 5,
      sourceEnd: 15,
      speed: 1
    }
    renderTimeline([row], { clips: [clipAtOneSecond], onTrimClip })

    const handle = document.querySelector<HTMLElement>('.studio-timeline__trim-handle--left')
    expect(handle).not.toBeNull()
    fireEvent.pointerDown(handle!, { pointerId: 1, button: 0, clientX: 0, clientY: 100 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: -216, clientY: 100 })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: -216, clientY: 100 })

    expect(onTrimClip).toHaveBeenCalledWith('clip-1', {
      sourceStart: 4,
      sourceEnd: 15,
      timelineStart: 0
    })
  })

  it('does not let right trim move beyond the asset duration', () => {
    const onTrimClip = vi.fn()
    const clipNearAssetEnd: TimelineClip = {
      ...clip,
      duration: 10,
      sourceStart: 5,
      sourceEnd: 15,
      speed: 1
    }
    renderTimeline([row], { clips: [clipNearAssetEnd], onTrimClip })

    const handle = document.querySelector<HTMLElement>('.studio-timeline__trim-handle--right')
    expect(handle).not.toBeNull()
    fireEvent.pointerDown(handle!, { pointerId: 2, button: 0, clientX: 0, clientY: 100 })
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 4320, clientY: 100 })
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 4320, clientY: 100 })

    expect(onTrimClip).toHaveBeenCalledWith('clip-1', {
      sourceStart: 5,
      sourceEnd: 65,
      timelineStart: 0
    })
  })

  it('passes a compatible vertical track target when a clip is dragged across rows', () => {
    const onMoveClip = vi.fn()
    const tracks: EditorTrack[] = [
      {
        id: 'track-video-overlay',
        name: 'V2',
        kind: 'overlay',
        locked: false,
        hidden: false,
        muted: false
      },
      {
        id: 'track-video-main',
        name: 'V1',
        kind: 'video',
        locked: false,
        hidden: false,
        muted: false
      },
      {
        id: 'track-audio-main',
        name: 'A1',
        kind: 'audio',
        locked: false,
        hidden: false,
        muted: false
      }
    ]
    renderTimeline([row], { tracks, onMoveClip })
    const rows = Array.from(document.querySelectorAll<HTMLElement>('.studio-timeline__track-row'))
    rows.forEach((trackRow, index) => {
      Object.defineProperty(trackRow, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 30 + index * 56, bottom: 30 + (index + 1) * 56 })
      })
    })

    const clipButton = screen.getByRole('button', { name: /clip.mp4.*01:05/ })
    fireEvent.pointerDown(clipButton, { pointerId: 3, button: 0, clientX: 0, clientY: 100 })
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 72, clientY: 50 })
    fireEvent.pointerUp(window, { pointerId: 3, clientX: 72, clientY: 50 })

    expect(onMoveClip).toHaveBeenCalledWith('clip-1', 1, 'track-video-overlay')
  })

  it('does not drop a video clip onto an audio or locked track', () => {
    const onMoveClip = vi.fn()
    const tracks: EditorTrack[] = [
      {
        id: 'track-video-overlay',
        name: 'V2',
        kind: 'overlay',
        locked: false,
        hidden: false,
        muted: false
      },
      {
        id: 'track-video-main',
        name: 'V1',
        kind: 'video',
        locked: false,
        hidden: false,
        muted: false
      },
      {
        id: 'track-audio-main',
        name: 'A1',
        kind: 'audio',
        locked: true,
        hidden: false,
        muted: false
      }
    ]
    renderTimeline([row], { tracks, onMoveClip })
    const rows = Array.from(document.querySelectorAll<HTMLElement>('.studio-timeline__track-row'))
    rows.forEach((trackRow, index) => {
      Object.defineProperty(trackRow, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 30 + index * 56, bottom: 30 + (index + 1) * 56 })
      })
    })

    const clipButton = screen.getByRole('button', { name: /clip.mp4.*01:05/ })
    fireEvent.pointerDown(clipButton, { pointerId: 4, button: 0, clientX: 0, clientY: 100 })
    fireEvent.pointerMove(window, { pointerId: 4, clientX: 72, clientY: 170 })
    expect(rows[2]).toHaveAttribute('data-drop-invalid', 'true')
    fireEvent.pointerUp(window, { pointerId: 4, clientX: 72, clientY: 170 })

    expect(onMoveClip).not.toHaveBeenCalled()
  })
})
