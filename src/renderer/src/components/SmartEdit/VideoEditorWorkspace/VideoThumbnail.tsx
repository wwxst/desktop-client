import type { JSX } from 'react'
import { useVideoThumbnail } from './useVideoThumbnail'

interface VideoThumbnailProps {
  url?: string | null
  className?: string
  alt?: string
  enabled?: boolean
}

export default function VideoThumbnail({
  url,
  className,
  alt = '',
  enabled = true
}: VideoThumbnailProps): JSX.Element | null {
  const thumbnail = useVideoThumbnail(url, enabled)
  if (!thumbnail) return null
  return <img className={className} src={thumbnail} alt={alt} draggable={false} />
}
