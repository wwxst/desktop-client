import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Timeline from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/Timeline'
import type {
  DraftRow,
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

function renderTimeline(rows: DraftRow[] = [row]): {
  clips: TimelineClip[]
  assets: MediaAsset[]
  activeClipId: null
  rows: DraftRow[]
  onSelectClip: ReturnType<typeof vi.fn>
  onUpdateRow: ReturnType<typeof vi.fn>
  onAddRow: ReturnType<typeof vi.fn>
  onDeleteRow: ReturnType<typeof vi.fn>
} {
  const props = {
    clips: [clip],
    assets: [asset],
    activeClipId: null,
    rows,
    onSelectClip: vi.fn(),
    onUpdateRow: vi.fn(),
    onAddRow: vi.fn(),
    onDeleteRow: vi.fn()
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
})
