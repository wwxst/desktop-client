import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PlayerPanel from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/PlayerPanel'
import {
  DEFAULT_EDITOR_TRACKS,
  createInitialEditorProjectState,
  type EditorProjectState,
  type MediaAsset,
  type TimelineClip
} from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorProject'

const videoA: MediaAsset = {
  id: 'asset-a',
  name: 'a.mp4',
  url: 'blob:a',
  duration: 5,
  status: 'ready'
}
const videoB: MediaAsset = {
  id: 'asset-b',
  name: 'b.mp4',
  url: 'blob:b',
  duration: 5,
  status: 'ready'
}
const overlay: MediaAsset = {
  id: 'asset-overlay',
  name: 'overlay.mp4',
  url: 'blob:overlay',
  duration: 5,
  status: 'ready'
}

const ratio = { id: '9:16', label: '9:16（抖音）', width: 9, height: 16 }

function createProject(clips: TimelineClip[]): EditorProjectState {
  const initial = createInitialEditorProjectState('row-1')
  return {
    ...initial,
    assets: [videoA, videoB, overlay],
    clips,
    tracks: DEFAULT_EDITOR_TRACKS
  }
}

function renderComposition(project: EditorProjectState, playhead: number): void {
  render(
    <PlayerPanel
      project={project}
      playhead={playhead}
      selectedRatio={ratio}
      onAspectRatioChange={vi.fn()}
      onMediaError={vi.fn()}
      onPlayheadChange={vi.fn()}
    />
  )
}

describe('Composition Preview playback', () => {
  it('renders the composition at the playhead instead of the selected clip', () => {
    const project = createProject([
      {
        id: 'clip-a',
        assetId: videoA.id,
        trackId: 'track-video-main',
        timelineStart: 0,
        sourceStart: 0,
        sourceEnd: 5
      },
      {
        id: 'clip-b',
        assetId: videoB.id,
        trackId: 'track-video-main',
        timelineStart: 5,
        sourceStart: 0,
        sourceEnd: 5
      },
      {
        id: 'clip-overlay',
        assetId: overlay.id,
        trackId: 'track-video-overlay',
        timelineStart: 5,
        sourceStart: 0,
        sourceEnd: 5,
        speed: 2,
        transform: { x: 12, y: -8, scaleX: 1.2, scaleY: 0.8, rotation: 10 },
        opacity: 0.5
      }
    ])

    renderComposition(project, 6)

    expect(screen.queryByLabelText('a.mp4合成预览')).not.toBeInTheDocument()
    const main = screen.getByLabelText('b.mp4合成预览')
    const overlayVideo = screen.getByLabelText('overlay.mp4合成预览')
    expect(main).toBeInTheDocument()
    expect(overlayVideo).toBeInTheDocument()
    expect(overlayVideo).toHaveStyle({
      opacity: '0.5',
      transform: 'translate(12px, -8px) scale(1.2, 0.8) rotate(10deg)'
    })
    expect((overlayVideo as HTMLVideoElement).playbackRate).toBe(2)
  })

  it('uses the project duration for the playback counter', () => {
    const project = createProject([
      {
        id: 'clip-a',
        assetId: videoA.id,
        trackId: 'track-video-main',
        timelineStart: 2,
        sourceStart: 0,
        sourceEnd: 5
      }
    ])

    renderComposition(project, 2)

    expect(screen.getAllByText('00:00:07')).toHaveLength(1)
  })

  it('advances the project clock across clip boundaries', () => {
    const project = createProject([
      {
        id: 'clip-a',
        assetId: videoA.id,
        trackId: 'track-video-main',
        timelineStart: 0,
        sourceStart: 0,
        sourceEnd: 5
      },
      {
        id: 'clip-b',
        assetId: videoB.id,
        trackId: 'track-video-main',
        timelineStart: 5,
        sourceStart: 0,
        sourceEnd: 5
      }
    ])
    const onPlayheadChange = vi.fn()
    const callbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)

    render(
      <PlayerPanel
        project={project}
        playhead={4.5}
        selectedRatio={ratio}
        onAspectRatioChange={vi.fn()}
        onMediaError={vi.fn()}
        onPlayheadChange={onPlayheadChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '播放' }))
    expect(callbacks).toHaveLength(1)
    callbacks.shift()?.(2000)

    expect(onPlayheadChange).toHaveBeenCalledWith(5.5)
    play.mockRestore()
  })
})
