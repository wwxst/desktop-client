import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import FunctionPanel from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/FunctionPanel'
import type { MediaAsset } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorProject'

const readyAsset: MediaAsset = {
  id: 'asset-1',
  name: 'ready.mp4',
  url: 'blob:ready',
  duration: 65,
  status: 'ready'
}

function renderPanel(mediaItems: MediaAsset[] = []): {
  mediaItems: MediaAsset[]
  addedMediaIds: Set<string>
  onImportMedia: ReturnType<typeof vi.fn>
  onAddMedia: ReturnType<typeof vi.fn>
} {
  const props = {
    mediaItems,
    addedMediaIds: new Set<string>(),
    onImportMedia: vi.fn(),
    onAddMedia: vi.fn()
  }
  render(<FunctionPanel {...props} />)
  return props
}

describe('FunctionPanel', () => {
  it('switches categories through real tab interaction', async () => {
    const user = userEvent.setup()
    renderPanel()

    expect(screen.getByRole('tab', { name: '媒体' })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('tab', { name: '音频' }))
    expect(screen.getByRole('tab', { name: '音频' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('button', { name: '导入' })).not.toBeInTheDocument()
  })

  it('submits selected video files and resets the file input', async () => {
    const user = userEvent.setup()
    const { onImportMedia } = renderPanel()
    const file = new File(['video'], 'sample.mp4', { type: 'video/mp4' })
    const input = screen.getByLabelText('导入媒体') as HTMLInputElement

    await user.upload(input, file)

    expect(onImportMedia).toHaveBeenCalledWith([file])
    expect(input.value).toBe('')
  })

  it('adds ready media and reports its duration', async () => {
    const user = userEvent.setup()
    const { onAddMedia } = renderPanel([readyAsset])

    expect(screen.getByText('01:05')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '添加ready.mp4' }))
    expect(onAddMedia).toHaveBeenCalledWith('asset-1')
  })
})
