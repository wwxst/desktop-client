import { resolveTimelineClip, type EditorProjectState, type TimelineClip } from './editorProject'

export interface EditorClipboardItem {
  clip: TimelineClip
  relativeStart: number
}

export interface EditorClipboardSnapshot {
  items: EditorClipboardItem[]
  sourceAnchor: number
}

export function createClipboardSnapshot(
  project: EditorProjectState,
  clipIds: readonly string[]
): EditorClipboardSnapshot | null {
  const selected = project.clips
    .filter((clip) => clipIds.includes(clip.id))
    .map((clip) => {
      const asset = project.assets.find((item) => item.id === clip.assetId) ?? null
      return resolveTimelineClip(clip, asset)
    })
    .sort((left, right) => left.timelineStart - right.timelineStart)

  if (selected.length === 0) return null
  const sourceAnchor = Math.min(...selected.map((clip) => clip.timelineStart))
  return {
    sourceAnchor,
    items: selected.map((clip) => ({
      clip: { ...clip, transform: { ...clip.transform } },
      relativeStart: clip.timelineStart - sourceAnchor
    }))
  }
}

export function getClipboardClipIds(snapshot: EditorClipboardSnapshot | null): string[] {
  return snapshot?.items.map((item) => item.clip.id) ?? []
}
