import { useEffect, useState } from 'react'

const thumbnailCache = new Map<string, Promise<string | null>>()

export function useVideoThumbnail(url: string | null | undefined, enabled = true): string | null {
  const [result, setResult] = useState<{ url: string; thumbnail: string | null } | null>(null)
  const canLoad = enabled && Boolean(url)

  useEffect(() => {
    let cancelled = false
    if (!url || !enabled) {
      return
    }
    const request = thumbnailCache.get(url) ?? createThumbnail(url)
    thumbnailCache.set(url, request)
    void request.then((value) => {
      if (!cancelled) setResult({ url, thumbnail: value })
    })
    return () => {
      cancelled = true
    }
  }, [enabled, url])

  return canLoad && url && result?.url === url ? result.thumbnail : null
}

async function createThumbnail(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    let settled = false
    const cleanup = (): void => {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    const finish = (value: string | null): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }
    const capture = (): void => {
      try {
        const width = Math.max(1, video.videoWidth)
        const height = Math.max(1, video.videoHeight)
        const targetWidth = Math.min(320, width)
        const targetHeight = Math.max(1, Math.round((height / width) * targetWidth))
        const canvas = document.createElement('canvas')
        canvas.width = targetWidth
        canvas.height = targetHeight
        const context = canvas.getContext('2d')
        if (!context) {
          finish(null)
          return
        }
        context.drawImage(video, 0, 0, targetWidth, targetHeight)
        finish(canvas.toDataURL('image/jpeg', 0.72))
      } catch {
        finish(null)
      }
    }
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.addEventListener('loadeddata', capture, { once: true })
    video.addEventListener('error', () => finish(null), { once: true })
    video.src = url
    video.load()
  })
}
