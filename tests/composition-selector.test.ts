import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EDITOR_TRACKS,
  createInitialEditorProjectState,
  selectCompositionAtTime,
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
const audio: MediaAsset = {
  id: 'asset-audio',
  name: 'audio.mp3',
  url: 'blob:audio',
  duration: 10,
  status: 'ready',
  kind: 'audio'
}

function createProject(clips: TimelineClip[], tracks = DEFAULT_EDITOR_TRACKS): EditorProjectState {
  const initial = createInitialEditorProjectState('row-1')
  return { ...initial, assets: [videoA, videoB, overlay, audio], tracks, clips }
}

describe('selectCompositionAtTime', () => {
  it('selects the clip at the playhead and continues across adjacent clips', () => {
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
        id: 'clip-audio',
        assetId: audio.id,
        trackId: 'track-audio-main',
        timelineStart: 0,
        sourceStart: 0,
        sourceEnd: 10
      }
    ])

    const atFour = selectCompositionAtTime(project, 4)
    expect(atFour.videoLayers.map((clip) => clip.id)).toEqual(['clip-a'])
    expect(atFour.audioLayers.map((clip) => clip.id)).toEqual(['clip-audio'])

    const atSeven = selectCompositionAtTime(project, 7)
    expect(atSeven.videoLayers.map((clip) => clip.id)).toEqual(['clip-b'])
    expect(atSeven.audioLayers.map((clip) => clip.id)).toEqual(['clip-audio'])
  })

  it('orders V1 below V2, ignores hidden layers, and retains muted audio layers', () => {
    const tracks = DEFAULT_EDITOR_TRACKS.map((track) =>
      track.id === 'track-video-overlay' ? { ...track, hidden: false } : track
    )
    const project = createProject(
      [
        {
          id: 'clip-v1',
          assetId: videoA.id,
          trackId: 'track-video-main',
          timelineStart: 0,
          sourceStart: 0,
          sourceEnd: 5
        },
        {
          id: 'clip-v2',
          assetId: overlay.id,
          trackId: 'track-video-overlay',
          timelineStart: 0,
          sourceStart: 0,
          sourceEnd: 5,
          opacity: 0.5
        },
        {
          id: 'clip-hidden',
          assetId: videoB.id,
          trackId: 'track-video-overlay',
          timelineStart: 0,
          sourceStart: 0,
          sourceEnd: 5
        },
        {
          id: 'clip-muted-audio',
          assetId: audio.id,
          trackId: 'track-audio-main',
          timelineStart: 0,
          sourceStart: 0,
          sourceEnd: 5,
          muted: true
        }
      ],
      tracks.map((track) =>
        track.id === 'track-video-overlay' ? { ...track, hidden: false } : track
      )
    )

    const composition = selectCompositionAtTime(project, 2)
    expect(composition.videoLayers.map((clip) => clip.id)).toEqual(['clip-v1', 'clip-hidden'])
    expect(composition.audioLayers.map((clip) => clip.id)).toEqual(['clip-muted-audio'])
    expect(composition.audioLayers[0]?.muted).toBe(true)

    const hiddenProject = {
      ...project,
      tracks: project.tracks.map((track) =>
        track.id === 'track-video-overlay' ? { ...track, hidden: true } : track
      )
    }
    expect(selectCompositionAtTime(hiddenProject, 2).videoLayers.map((clip) => clip.id)).toEqual([
      'clip-v1'
    ])
  })

  it('keeps the later clip when clips overlap on the same track', () => {
    const project = createProject([
      {
        id: 'clip-first',
        assetId: videoA.id,
        trackId: 'track-video-main',
        timelineStart: 0,
        sourceStart: 0,
        sourceEnd: 5
      },
      {
        id: 'clip-later',
        assetId: videoB.id,
        trackId: 'track-video-main',
        timelineStart: 2,
        sourceStart: 0,
        sourceEnd: 5
      }
    ])

    expect(selectCompositionAtTime(project, 3).videoLayers.map((clip) => clip.id)).toEqual([
      'clip-later'
    ])
  })
})
