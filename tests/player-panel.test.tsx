import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PlayerPanel from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/PlayerPanel'
import type {
  CanvasAspectRatio,
  MediaAsset
} from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorProject'

const selectedRatio: CanvasAspectRatio = {
  id: '9:16',
  label: '9:16（抖音）',
  width: 9,
  height: 16
}

const readyAsset: MediaAsset = {
  id: 'asset-1',
  name: 'demo.mp4',
  url: 'blob:demo',
  duration: 12,
  status: 'ready'
}

function renderPlayer(activeAsset: MediaAsset | null = null): {
  onAspectRatioChange: ReturnType<typeof vi.fn>
  onMediaError: ReturnType<typeof vi.fn>
} {
  const onAspectRatioChange = vi.fn()
  const onMediaError = vi.fn()

  render(
    <PlayerPanel
      activeAsset={activeAsset}
      selectedRatio={selectedRatio}
      onAspectRatioChange={onAspectRatioChange}
      onMediaError={onMediaError}
    />
  )

  return { onAspectRatioChange, onMediaError }
}

describe('PlayerPanel', () => {
  it('opens the ratio menu and applies a preset', async () => {
    const user = userEvent.setup()
    const { onAspectRatioChange } = renderPlayer()

    expect(screen.getByLabelText('暂无预览内容，画面比例 9:16（抖音）')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '画面比例' }))

    const option = screen.getByRole('menuitemradio', { name: /16:9（西瓜视频）/ })
    await user.click(option)

    expect(onAspectRatioChange).toHaveBeenCalledWith({
      id: '16:9',
      label: '16:9（西瓜视频）',
      width: 16,
      height: 9
    })
    expect(screen.queryByRole('menu', { name: '画面比例' })).not.toBeInTheDocument()
  })

  it('applies a valid custom ratio and closes from Escape', async () => {
    const user = userEvent.setup()
    const { onAspectRatioChange } = renderPlayer()

    await user.click(screen.getByRole('button', { name: '画面比例' }))
    await user.click(screen.getByRole('menuitem', { name: /自定义/ }))
    await user.clear(screen.getByRole('spinbutton', { name: '自定义宽度' }))
    await user.type(screen.getByRole('spinbutton', { name: '自定义宽度' }), '4')
    await user.clear(screen.getByRole('spinbutton', { name: '自定义高度' }))
    await user.type(screen.getByRole('spinbutton', { name: '自定义高度' }), '5')
    await user.click(screen.getByRole('button', { name: '应用自定义比例' }))

    expect(onAspectRatioChange).toHaveBeenCalledWith({
      id: 'custom-4-5',
      label: '4:5',
      width: 4,
      height: 5
    })

    await user.click(screen.getByRole('button', { name: '画面比例' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu', { name: '画面比例' })).not.toBeInTheDocument()
  })

  it('previews the active video and toggles playback after it is ready', async () => {
    const user = userEvent.setup()
    renderPlayer(readyAsset)
    const video = screen.getByLabelText('demo.mp4播放器预览') as HTMLVideoElement
    const play = vi.spyOn(video, 'play').mockResolvedValue()
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => undefined)
    Object.defineProperty(video, 'duration', { configurable: true, value: 12 })

    fireEvent.loadedData(video)
    const playButton = screen.getByRole('button', { name: '播放' })
    expect(playButton).toBeEnabled()

    await user.click(playButton)
    expect(play).toHaveBeenCalledOnce()
    fireEvent.play(video)
    expect(screen.getByRole('button', { name: '暂停' })).toBeInTheDocument()

    Object.defineProperty(video, 'paused', { configurable: true, value: false })
    await user.click(screen.getByRole('button', { name: '暂停' }))
    expect(pause).toHaveBeenCalled()
  })
})
