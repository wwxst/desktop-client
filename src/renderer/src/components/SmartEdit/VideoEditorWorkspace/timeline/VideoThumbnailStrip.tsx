import type { JSX } from 'react'
import { useVideoThumbnailStrip } from './useVideoThumbnailStrip'

interface VideoThumbnailStripProps {
  url?: string | null
  duration?: number | null
  sourceStart?: number
  sourceEnd?: number
  pixelWidth: number
  enabled?: boolean
}

export default function VideoThumbnailStrip({
  url,
  duration,
  sourceStart,
  sourceEnd,
  pixelWidth,
  enabled = true
}: VideoThumbnailStripProps): JSX.Element | null {
  const count = Math.max(1, Math.min(8, Math.ceil(pixelWidth / 78)))
  const frames = useVideoThumbnailStrip({
    url,
    duration,
    sourceStart,
    sourceEnd,
    count,
    enabled
  })

  if (frames.length === 0) return null
  return (
    <span className="studio-timeline__thumbnail-strip" aria-hidden="true">
      {frames.map((src, index) => (
        <img key={`${index}-${src.slice(-18)}`} src={src} alt="" draggable={false} />
      ))}
    </span>
  )
}
