import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PlayerPanel from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/PlayerPanel'
import {
  createInitialEditorProjectState,
  type CanvasAspectRatio,
  type EditorTrack,
  type MediaAsset,
  type ResolvedTimelineClip
} from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorProject'
import { createEditorPlaybackController } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/playback/editorPlaybackController'

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

const activeClip: ResolvedTimelineClip = {
  id: 'clip-1',
  assetId: readyAsset.id,
  trackId: 'track-video-main',
  timelineStart: 0,
  duration: 12,
  sourceStart: 0,
  sourceEnd: 12,
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
  opacity: 1,
  volume: 1,
  muted: false,
  speed: 1
}

const mainTrack: EditorTrack = {
  id: 'track-video-main',
  name: 'V1',
  kind: 'video',
  locked: false,
  hidden: false,
  muted: false
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

function renderControlledPlayer(): void {
  render(
    <PlayerPanel
      project={createInitialEditorProjectState('row-1')}
      playbackController={createEditorPlaybackController()}
      selectedRatio={selectedRatio}
      onAspectRatioChange={vi.fn()}
      onMediaError={vi.fn()}
    />
  )
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

  it('does not render a hidden track in the preview', () => {
    render(
      <PlayerPanel
        activeAsset={readyAsset}
        activeClip={activeClip}
        activeTrack={{ ...mainTrack, hidden: true }}
        selectedRatio={selectedRatio}
        onAspectRatioChange={vi.fn()}
        onMediaError={vi.fn()}
      />
    )

    expect(screen.queryByLabelText('demo.mp4播放器预览')).not.toBeInTheDocument()
  })

  it('applies track mute to the active preview', () => {
    render(
      <PlayerPanel
        activeAsset={readyAsset}
        activeClip={activeClip}
        activeTrack={{ ...mainTrack, muted: true }}
        selectedRatio={selectedRatio}
        onAspectRatioChange={vi.fn()}
        onMediaError={vi.fn()}
      />
    )

    const video = screen.getByLabelText('demo.mp4播放器预览') as HTMLVideoElement
    fireEvent.loadedData(video)

    expect(video.muted).toBe(true)
  })

  it('does not render preview volume, loop, or zoom controls', () => {
    renderControlledPlayer()

    expect(screen.queryByRole('slider', { name: '预览总音量' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '循环播放' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '缩小预览' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '放大预览' })).not.toBeInTheDocument()
    expect(screen.queryByText('100%')).not.toBeInTheDocument()
  })
})
