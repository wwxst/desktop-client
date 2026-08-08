import type { CSSProperties, JSX } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import type { EditorProjectState, ResolvedTimelineClip, TimelineComposition } from './editorProject'
import './CompositionPreview.css'

interface CompositionPreviewProps {
  project: EditorProjectState
  composition: TimelineComposition
  playhead: number
  isPlaying: boolean
  onMediaError: (assetId: string) => void
}

interface LayerStyle extends CSSProperties {
  zIndex: number
}

function CompositionPreview({
  project,
  composition,
  playhead,
  isPlaying,
  onMediaError
}: CompositionPreviewProps): JSX.Element {
  const mediaRefs = useRef<Map<string, HTMLMediaElement>>(new Map())
  const assetsById = useMemo(
    () => new Map(project.assets.map((asset) => [asset.id, asset])),
    [project.assets]
  )
  const layers = useMemo(
    () => [...composition.videoLayers, ...composition.audioLayers],
    [composition.audioLayers, composition.videoLayers]
  )
  const audioLayerIds = useMemo(
    () => new Set(composition.audioLayers.map((layer) => layer.id)),
    [composition.audioLayers]
  )

  useEffect(() => {
    const visibleIds = new Set(layers.map((clip) => clip.id))
    for (const id of mediaRefs.current.keys()) {
      if (!visibleIds.has(id)) mediaRefs.current.delete(id)
    }

    for (const clip of layers) {
      const media = mediaRefs.current.get(clip.id)
      if (!media) continue
      const isAudio = audioLayerIds.has(clip.id)
      media.muted = !isAudio
      media.volume = isAudio ? clamp(clip.volume, 0, 1) : 0
      media.playbackRate = clip.speed
      const sourceTime = getSourceTime(clip, playhead)
      if (Math.abs(media.currentTime - sourceTime) > 0.04) media.currentTime = sourceTime
    }
  }, [audioLayerIds, layers, playhead])

  useEffect(() => {
    for (const media of mediaRefs.current.values()) {
      if (isPlaying) {
        try {
          const playResult = media.play()
          if (playResult) void playResult.catch(() => undefined)
        } catch {
          // Autoplay restrictions are handled by the next explicit play attempt.
        }
      } else {
        media.pause()
      }
    }
  }, [isPlaying, layers])

  return (
    <div className="studio-composition-preview" aria-label="工程合成预览">
      {layers.map((clip, index) => {
        const asset = assetsById.get(clip.assetId)
        if (!asset || asset.status !== 'ready') return null

        const isAudio = audioLayerIds.has(clip.id)
        const mediaProps = {
          key: clip.id,
          ref: (media: HTMLMediaElement | null) => {
            if (media) mediaRefs.current.set(clip.id, media)
            else mediaRefs.current.delete(clip.id)
          },
          src: asset.url,
          preload: 'auto' as const,
          playsInline: true,
          muted: isAudio ? clip.muted : true,
          onLoadedData: (event: React.SyntheticEvent<HTMLMediaElement>) => {
            event.currentTarget.currentTime = getSourceTime(clip, playhead)
          },
          onError: () => onMediaError(asset.id),
          style: getLayerStyle(clip, index, isAudio),
          'aria-label': `${asset.name}${isAudio ? '合成音频' : '合成预览'}`
        }

        return isAudio ? (
          <audio className="studio-composition-preview__audio" {...mediaProps} />
        ) : (
          <video className="studio-composition-preview__media" {...mediaProps} />
        )
      })}
    </div>
  )
}

function getSourceTime(clip: ResolvedTimelineClip, playhead: number): number {
  return clamp(
    clip.sourceStart + (playhead - clip.timelineStart) * clip.speed,
    clip.sourceStart,
    clip.sourceEnd
  )
}

function getLayerStyle(clip: ResolvedTimelineClip, index: number, isAudio: boolean): LayerStyle {
  if (isAudio) return { zIndex: index + 1 }
  const { transform } = clip
  return {
    zIndex: index + 1,
    opacity: clip.opacity,
    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scaleX}, ${transform.scaleY}) rotate(${transform.rotation}deg)`
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export default CompositionPreview
