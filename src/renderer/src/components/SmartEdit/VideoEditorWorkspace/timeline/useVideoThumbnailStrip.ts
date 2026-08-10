import { useEffect, useMemo, useState } from 'react'

const stripCache = new Map<string, Promise<string[]>>()
const MAX_STRIP_FRAMES = 8

export interface ThumbnailStripRequest {
  url?: string | null
  duration?: number | null
  sourceStart?: number
  sourceEnd?: number
  count: number
  enabled?: boolean
}

export function useVideoThumbnailStrip({
  url,
  duration,
  sourceStart = 0,
  sourceEnd,
  count,
  enabled = true
}: ThumbnailStripRequest): string[] {
  const safeCount = Math.max(1, Math.min(MAX_STRIP_FRAMES, Math.round(count)))
  const safeEnd = Math.max(sourceStart, sourceEnd ?? duration ?? sourceStart)
  const key = useMemo(
    () => (url ? `${url}|${sourceStart.toFixed(3)}|${safeEnd.toFixed(3)}|${safeCount}` : ''),
    [safeCount, safeEnd, sourceStart, url]
  )
  const [frames, setFrames] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    if (!enabled || !url || !duration || duration <= 0 || !key) {
      setFrames([])
      return
    }
    const request = stripCache.get(key) ?? createThumbnailStrip(url, duration, sourceStart, safeEnd, safeCount)
    stripCache.set(key, request)
    void request.then((value) => {
      if (!cancelled) setFrames(value)
    })
    return () => {
      cancelled = true
    }
  }, [duration, enabled, key, safeCount, safeEnd, sourceStart, url])

  return frames
}

async function createThumbnailStrip(
  url: string,
  duration: number,
  sourceStart: number,
  sourceEnd: number,
  count: number
): Promise<string[]> {
  const start = Math.max(0, Math.min(duration, sourceStart))
  const end = Math.max(start, Math.min(duration, sourceEnd))
  const times = Array.from({ length: count }, (_, index) => {
    if (count === 1) return start + (end - start) * 0.5
    return start + ((end - start) * index) / Math.max(1, count - 1)
  })

  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true

  const waitFor = (eventName: 'loadedmetadata' | 'seeked'): Promise<void> =>
    new Promise((resolve, reject) => {
      const onSuccess = (): void => {
        cleanup()
        resolve()
      }
      const onError = (): void => {
        cleanup()
        reject(new Error('thumbnail media error'))
      }
      const cleanup = (): void => {
        video.removeEventListener(eventName, onSuccess)
        video.removeEventListener('error', onError)
      }
      video.addEventListener(eventName, onSuccess, { once: true })
      video.addEventListener('error', onError, { once: true })
    })

  try {
    video.src = url
    video.load()
    if (video.readyState < video.HAVE_METADATA) await waitFor('loadedmetadata')

    const naturalWidth = Math.max(1, video.videoWidth)
    const naturalHeight = Math.max(1, video.videoHeight)
    const targetWidth = Math.min(180, naturalWidth)
    const targetHeight = Math.max(1, Math.round((naturalHeight / naturalWidth) * targetWidth))
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const context = canvas.getContext('2d')
    if (!context) return []

    const frames: string[] = []
    for (const time of times) {
      const seekTime = Math.max(0, Math.min(Math.max(0, video.duration - 0.001), time))
      if (Math.abs(video.currentTime - seekTime) > 0.002) {
        video.currentTime = seekTime
        await waitFor('seeked')
      }
      context.drawImage(video, 0, 0, targetWidth, targetHeight)
      frames.push(canvas.toDataURL('image/jpeg', 0.66))
    }
    return frames
  } catch {
    return []
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
}
