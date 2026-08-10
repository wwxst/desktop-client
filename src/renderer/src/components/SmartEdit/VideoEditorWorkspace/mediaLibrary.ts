import type { EditorProjectAction, MediaAsset } from './editorProject'

export interface MediaMetadata {
  duration: number
  width?: number
  height?: number
}

interface MediaDetectionCallbacks {
  onReady: (metadata: MediaMetadata | number) => void
  onError: () => void
}

type DetectMedia = (url: string, callbacks: MediaDetectionCallbacks) => () => void

interface MediaLibraryDependencies {
  createId: () => string
  createObjectURL: (file: File) => string
  revokeObjectURL: (url: string) => void
  detectMedia: DetectMedia
}

interface MediaLibraryOptions {
  dispatch: (action: EditorProjectAction) => void
  dependencies?: Partial<MediaLibraryDependencies>
}

export interface MediaLibraryController {
  importFiles: (files: readonly File[]) => string[]
  reportError: (assetId: string) => void
  dispose: () => void
}

const detectVideo = (url: string, callbacks: MediaDetectionCallbacks): (() => void) => {
  const video = document.createElement('video')
  let active = true

  const releaseVideo = (): void => {
    video.removeEventListener('loadedmetadata', handleLoadedMetadata)
    video.removeEventListener('loadeddata', handleLoadedData)
    video.removeEventListener('error', handleError)
    video.pause()
    video.removeAttribute('src')
    video.load()
  }

  const finishReady = (): void => {
    if (!active) return
    active = false
    const metadata: MediaMetadata = {
      duration: video.duration,
      width: video.videoWidth || undefined,
      height: video.videoHeight || undefined
    }
    releaseVideo()
    callbacks.onReady(metadata)
  }

  function handleLoadedMetadata(): void {
    if (video.readyState >= video.HAVE_CURRENT_DATA) finishReady()
  }

  function handleLoadedData(): void {
    finishReady()
  }

  function handleError(): void {
    if (!active) return
    active = false
    releaseVideo()
    callbacks.onError()
  }

  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.addEventListener('loadedmetadata', handleLoadedMetadata)
  video.addEventListener('loadeddata', handleLoadedData)
  video.addEventListener('error', handleError)
  video.src = url
  video.load()

  return () => {
    if (!active) return
    active = false
    releaseVideo()
  }
}

const defaultDependencies: MediaLibraryDependencies = {
  createId: () => crypto.randomUUID(),
  createObjectURL: (file) => URL.createObjectURL(file),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  detectMedia: detectVideo
}

export function createMediaLibraryController({
  dispatch,
  dependencies
}: MediaLibraryOptions): MediaLibraryController {
  const resolvedDependencies = { ...defaultDependencies, ...dependencies }
  const urlsByAssetId = new Map<string, string>()
  const pendingDetections = new Map<string, () => void>()
  let disposed = false

  const reportError = (assetId: string): void => {
    if (disposed) return
    pendingDetections.get(assetId)?.()
    pendingDetections.delete(assetId)
    dispatch({ type: 'asset/failed', assetId, error: '无法预览该视频' })
  }

  const importFiles = (files: readonly File[]): string[] => {
    if (disposed) return []
    const assetIds: string[] = []

    files.forEach((file) => {
      if (!file.type.startsWith('video/')) return
      const asset: MediaAsset = {
        id: resolvedDependencies.createId(),
        name: file.name,
        url: resolvedDependencies.createObjectURL(file),
        duration: null,
        width: null,
        height: null,
        status: 'loading',
        kind: 'video'
      }
      assetIds.push(asset.id)
      let detectionSettled = false

      urlsByAssetId.set(asset.id, asset.url)
      dispatch({ type: 'assets/imported', asset })
      const cancelDetection = resolvedDependencies.detectMedia(asset.url, {
        onReady: (metadata) => {
          detectionSettled = true
          const normalized = typeof metadata === 'number' ? { duration: metadata } : metadata
          if (disposed || !urlsByAssetId.has(asset.id)) return
          pendingDetections.delete(asset.id)
          dispatch({
            type: 'asset/ready',
            assetId: asset.id,
            duration: normalized.duration,
            width: normalized.width,
            height: normalized.height
          })
        },
        onError: () => {
          detectionSettled = true
          reportError(asset.id)
        }
      })
      if (!detectionSettled) pendingDetections.set(asset.id, cancelDetection)
    })

    return assetIds
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    pendingDetections.forEach((cancelDetection) => cancelDetection())
    pendingDetections.clear()
    urlsByAssetId.forEach((url) => resolvedDependencies.revokeObjectURL(url))
    urlsByAssetId.clear()
  }

  return { importFiles, reportError, dispose }
}
