export const EDITOR_ASSET_DRAG_MIME = 'application/x-desktop-client-media-asset'

export interface EditorAssetDragPayload {
  assetId: string
}

export function setEditorAssetDragData(dataTransfer: DataTransfer, assetId: string): void {
  const payload: EditorAssetDragPayload = { assetId }
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(EDITOR_ASSET_DRAG_MIME, JSON.stringify(payload))
  dataTransfer.setData('text/plain', assetId)
}

export function readEditorAssetDragData(dataTransfer: DataTransfer): EditorAssetDragPayload | null {
  const raw = dataTransfer.getData(EDITOR_ASSET_DRAG_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<EditorAssetDragPayload>
    return typeof parsed.assetId === 'string' && parsed.assetId ? { assetId: parsed.assetId } : null
  } catch {
    return null
  }
}

export function containsExternalFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes('Files')
}
