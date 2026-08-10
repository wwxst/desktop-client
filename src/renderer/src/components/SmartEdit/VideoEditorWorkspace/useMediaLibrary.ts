import { useCallback, useEffect, useRef } from 'react'
import type { EditorProjectAction } from './editorProject'
import { createMediaLibraryController, type MediaLibraryController } from './mediaLibrary'

export function useMediaLibrary(dispatch: (action: EditorProjectAction) => void): {
  importMediaFiles: (files: readonly File[]) => string[]
  reportMediaError: (assetId: string) => void
} {
  const controllerRef = useRef<MediaLibraryController | null>(null)
  const getController = useCallback((): MediaLibraryController => {
    if (!controllerRef.current) controllerRef.current = createMediaLibraryController({ dispatch })
    return controllerRef.current
  }, [dispatch])

  useEffect(
    () => () => {
      controllerRef.current?.dispose()
      controllerRef.current = null
    },
    []
  )

  const importMediaFiles = useCallback(
    (files: readonly File[]): string[] => getController().importFiles(files),
    [getController]
  )
  const reportMediaError = useCallback(
    (assetId: string): void => getController().reportError(assetId),
    [getController]
  )

  return { importMediaFiles, reportMediaError }
}
