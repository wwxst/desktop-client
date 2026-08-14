import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  JSX,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent
} from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  Layers2,
  Lock,
  Magnet,
  Redo2,
  RotateCcw,
  Scissors,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  Plus,
  Video,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import EditorContextMenu, { type EditorContextMenuItem } from './EditorContextMenu'
import VideoThumbnailStrip from './timeline/VideoThumbnailStrip'
import { canMoveClipToTrack } from './editorClipMath'
import { containsExternalFiles, EDITOR_ASSET_DRAG_MIME, readEditorAssetDragData } from './editorDnD'
import {
  EDITOR_DRAG_THRESHOLD_PX,
  getEdgeAutoScrollDelta,
  hasExceededDragThreshold
} from './editorInteraction'
import {
  MAX_TIMELINE_ZOOM,
  MIN_CLIP_DURATION,
  MIN_TIMELINE_ZOOM,
  getMainVisualTrack,
  getProjectDuration,
  isVisualTrack,
  resolveTimelineClip,
  trackWouldCollide,
  type DraftRow,
  type EditorProjectState,
  type EditorTrack,
  type MediaAsset,
  type ResolvedTimelineClip,
  type TimelineClip
} from './editorProject'
import {
  clamp,
  formatTimecode,
  getRulerStep,
  quantizeTime,
  snapTimeToCandidates
} from './editorTime'
import type { EditorPlaybackController } from './playback/editorPlaybackController'
import { useEditorPlayhead } from './playback/useEditorPlayback'
import type { EditorInteractionController } from './interaction/editorInteractionController'
import './Timeline.css'

const RULER_HEIGHT = 30
const SNAP_THRESHOLD_PX = 8

interface TimelineProps {
  clips: TimelineClip[]
  assets: MediaAsset[]
  activeClipId: string | null
  selectedClipIds?: readonly string[]
  tracks?: EditorTrack[]
  playhead?: number
  playbackController?: EditorPlaybackController
  interactionController?: EditorInteractionController
  zoom?: number
  canUndo?: boolean
  canRedo?: boolean
  canPaste?: boolean
  snappingEnabled?: boolean
  onSnappingChange?: (enabled: boolean) => void
  magnetEnabled?: boolean
  onMagnetChange?: (enabled: boolean) => void
  onSelectClip: (clipId: string) => void
  onSelectionChange?: (clipIds: readonly string[], activeClipId?: string | null) => void
  onSetPlayhead?: (time: number) => void
  onMoveClip?: (clipId: string, timelineStart: number, trackId?: string) => void
  onMoveClips?: (
    moves: readonly { clipId: string; timelineStart: number; trackId?: string }[]
  ) => void
  onMoveClipToNewLayer?: (clipId: string, timelineStart: number) => void
  onTrimClip?: (
    clipId: string,
    trim: { sourceStart: number; sourceEnd: number; timelineStart?: number }
  ) => void
  onSplitClip?: (clipId: string, at: number) => void
  onDeleteClip?: (clipId: string) => void
  onDeleteClips?: (clipIds: readonly string[]) => void
  onAddMediaAt?: (assetId: string, timelineStart: number, trackId?: string) => void
  onAddMediaToNewLayer?: (assetId: string, timelineStart: number) => void
  onExternalFilesDrop?: (
    files: readonly File[],
    placement: { timelineStart: number; trackId?: string; newVisualLayer?: boolean }
  ) => void
  onCopyClips?: (clipIds: readonly string[]) => void
  onCutClips?: (clipIds: readonly string[]) => void
  onPaste?: (timelineStart: number) => void
  onDuplicateClips?: (clipIds: readonly string[]) => void
  onToggleClipMute?: (clipId: string) => void
  onToggleClipEnabled?: (clipId: string) => void
  onResetClipTransform?: (clipId: string) => void
  onUpdateTrack?: (
    trackId: string,
    patch: Partial<Pick<EditorTrack, 'locked' | 'hidden' | 'muted' | 'name'>>
  ) => void
  onZoomChange?: (zoom: number) => void
  onUndo?: () => void
  onRedo?: () => void
  /** 兼容旧版测试/草稿设置。 */
  rows?: DraftRow[]
  onUpdateRow?: (rowId: string, updates: Partial<Omit<DraftRow, 'id'>>) => void
  onAddRow?: (afterRowId: string) => void
  onDeleteRow?: (rowId: string) => void
}

interface MoveInteraction {
  mode: 'move'
  pointerId: number
  clip: ResolvedTimelineClip
  group: ResolvedTimelineClip[]
  startClientX: number
  startClientY: number
  startScrollLeft: number
  exceededThreshold: boolean
  previewDelta: number
  previewTrackId: string
  previewNewLayer: boolean
  isDropValid: boolean
  snapTarget: number | null
}

interface TrimInteraction {
  mode: 'trim-left' | 'trim-right'
  pointerId: number
  clip: ResolvedTimelineClip
  startClientX: number
  startClientY: number
  startScrollLeft: number
  exceededThreshold: boolean
  previewTimelineStart: number
  previewSourceStart: number
  previewSourceEnd: number
  previewDuration: number
  snapTarget: number | null
}

interface PanInteraction {
  mode: 'pan'
  pointerId: number
  startClientX: number
  startClientY: number
  startScrollLeft: number
  startScrollTop: number
}

interface SelectInteraction {
  mode: 'select'
  pointerId: number
  startClientX: number
  startClientY: number
  currentClientX: number
  currentClientY: number
  startScrollLeft: number
  startScrollTop: number
  append: boolean
  exceededThreshold: boolean
}

type TimelineInteraction = MoveInteraction | TrimInteraction | PanInteraction | SelectInteraction

interface TimelineCssProperties extends CSSProperties {
  '--clip-left': string
  '--clip-width': string
}

interface TimelineRulerCssProperties extends CSSProperties {
  '--timeline-ruler-minor-step': string
}

interface AssetDropPreview {
  trackId: string | null
  newVisualLayer: boolean
  timelineStart: number
  valid: boolean
}

interface TimelineContextState {
  x: number
  y: number
  kind: 'clip' | 'blank' | 'track'
  clipId?: string
  trackId?: string
  time: number
}

const LEGACY_TRACKS: EditorTrack[] = [
  {
    id: 'track-video-main',
    name: '主视频',
    kind: 'video',
    role: 'main',
    locked: false,
    hidden: false,
    muted: false
  }
]

function Timeline({
  clips,
  assets,
  activeClipId,
  selectedClipIds,
  tracks = LEGACY_TRACKS,
  playhead: fallbackPlayhead = 0,
  playbackController,
  interactionController,
  zoom = 72,
  canUndo = false,
  canRedo = false,
  canPaste = false,
  snappingEnabled = true,
  onSnappingChange,
  magnetEnabled = false,
  onMagnetChange,
  onSelectClip,
  onSelectionChange,
  onSetPlayhead,
  onMoveClip,
  onMoveClips,
  onMoveClipToNewLayer,
  onTrimClip,
  onSplitClip,
  onDeleteClip,
  onDeleteClips,
  onAddMediaAt,
  onAddMediaToNewLayer,
  onExternalFilesDrop,
  onCopyClips,
  onCutClips,
  onPaste,
  onDuplicateClips,
  onToggleClipMute,
  onToggleClipEnabled,
  onResetClipTransform,
  onUpdateTrack,
  onZoomChange,
  onUndo,
  onRedo,
  rows,
  onUpdateRow,
  onAddRow,
  onDeleteRow
}: TimelineProps): JSX.Element {
  const playhead = useEditorPlayhead(playbackController, fallbackPlayhead)
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets])
  const resolvedClips = useMemo(
    () => clips.map((clip) => resolveTimelineClip(clip, assetsById.get(clip.assetId) ?? null)),
    [assetsById, clips]
  )
  const selectedIds = useMemo(
    () => new Set(selectedClipIds ?? (activeClipId ? [activeClipId] : [])),
    [activeClipId, selectedClipIds]
  )
  const [interaction, setInteraction] = useState<TimelineInteraction | null>(null)
  const [assetDropPreview, setAssetDropPreview] = useState<AssetDropPreview | null>(null)
  const [contextMenu, setContextMenu] = useState<TimelineContextState | null>(null)
  const [spacePressed, setSpacePressed] = useState(false)
  const [visibleTimeRange, setVisibleTimeRange] = useState({ start: 0, end: 30 })
  const trackHeadersRef = useRef<HTMLDivElement>(null)
  const newLayerDropRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const trackRowsRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const lastManualNavigationAtRef = useRef(0)

  const pseudoProject = useMemo<EditorProjectState>(
    () => ({
      assets,
      tracks,
      clips,
      activeClipId,
      playhead,
      timelineZoom: zoom,
      aspectRatio: { id: 'timeline-only', label: 'timeline-only', width: 9, height: 16 },
      draftRows: rows ?? []
    }),
    [activeClipId, assets, clips, playhead, rows, tracks, zoom]
  )
  const projectDuration = getProjectDuration(pseudoProject)
  const timelineDuration = Math.max(12, Math.ceil(projectDuration + 5))
  const timelineWidth = Math.max(760, timelineDuration * zoom)
  const timelineCanvasStyle: CSSProperties = { width: timelineWidth }

  const clipsByTrack = useMemo(() => {
    const map = new Map<string, ResolvedTimelineClip[]>()
    for (const clip of resolvedClips) {
      const list = map.get(clip.trackId) ?? []
      list.push(clip)
      map.set(clip.trackId, list)
    }
    return map
  }, [resolvedClips])

  const mainVisualTrack = useMemo(() => getMainVisualTrack(pseudoProject), [pseudoProject])
  const displayTracks = useMemo(() => {
    const visual = tracks.filter(isVisualTrack).filter((track) => {
      if (track.id === mainVisualTrack?.id) return true
      if ((clipsByTrack.get(track.id)?.length ?? 0) > 0) return true
      return interaction?.mode === 'move' && interaction.previewTrackId === track.id
    })
    const audio = tracks
      .filter((track) => track.kind === 'audio')
      .filter((track) => {
        if ((clipsByTrack.get(track.id)?.length ?? 0) > 0) return true
        return assetDropPreview?.trackId === track.id
      })
    return [...visual, ...audio]
  }, [assetDropPreview?.trackId, clipsByTrack, interaction, mainVisualTrack?.id, tracks])
  const isMainTrackCentered = displayTracks.length === 1 && displayTracks[0]?.role === 'main'

  const activeClip = resolvedClips.find((clip) => clip.id === activeClipId) ?? null
  const activeTrack = activeClip ? tracks.find((track) => track.id === activeClip.trackId) : null
  const canEditActiveClip = Boolean(activeClip && !activeTrack?.locked)
  const canSplitActiveClip = Boolean(
    activeClip &&
    canEditActiveClip &&
    playhead > activeClip.timelineStart + MIN_CLIP_DURATION &&
    playhead < activeClip.timelineStart + activeClip.duration - MIN_CLIP_DURATION
  )

  const snapCandidates = useMemo(() => {
    const excluded = new Set(
      interaction?.mode === 'move'
        ? interaction.group.map((clip) => clip.id)
        : activeClipId
          ? [activeClipId]
          : []
    )
    const candidates = [0, playhead]
    for (const clip of resolvedClips) {
      if (excluded.has(clip.id)) continue
      candidates.push(clip.timelineStart, clip.timelineStart + clip.duration)
    }
    return candidates
  }, [activeClipId, interaction, playhead, resolvedClips])

  const findTrackAtClientY = useCallback(
    (clientY: number): EditorTrack | null => {
      for (const track of displayTracks) {
        const row = trackRowsRef.current.get(track.id)
        if (!row) continue
        const rect = row.getBoundingClientRect()
        if (clientY >= rect.top && clientY < rect.bottom) return track
      }
      return null
    },
    [displayTracks]
  )

  const clientXToTime = useCallback(
    (clientX: number): number => {
      const scrollArea = scrollAreaRef.current
      if (!scrollArea) return 0
      const rect = scrollArea.getBoundingClientRect()
      return quantizeTime(Math.max(0, (clientX - rect.left + scrollArea.scrollLeft) / zoom))
    },
    [zoom]
  )

  const updateVisibleTimeRange = useCallback((): void => {
    const scrollArea = scrollAreaRef.current
    if (!scrollArea) return
    const viewportDuration = Math.max(1, scrollArea.clientWidth / zoom)
    const buffer = Math.max(3, viewportDuration * 0.75)
    const start = Math.max(0, scrollArea.scrollLeft / zoom - buffer)
    const end = (scrollArea.scrollLeft + scrollArea.clientWidth) / zoom + buffer
    setVisibleTimeRange((current) =>
      Math.abs(current.start - start) < 0.01 && Math.abs(current.end - end) < 0.01
        ? current
        : { start, end }
    )
  }, [zoom])

  useEffect(() => {
    updateVisibleTimeRange()
    const scrollArea = scrollAreaRef.current
    if (!scrollArea || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateVisibleTimeRange)
    observer.observe(scrollArea)
    return () => observer.disconnect()
  }, [updateVisibleTimeRange])

  const autoScrollForPointer = useCallback((clientX: number, clientY: number): void => {
    const scrollArea = scrollAreaRef.current
    if (!scrollArea) return
    const rect = scrollArea.getBoundingClientRect()
    const dx = getEdgeAutoScrollDelta(clientX, rect.left, rect.right)
    const dy = getEdgeAutoScrollDelta(clientY, rect.top + RULER_HEIGHT, rect.bottom)
    if (dx !== 0) scrollArea.scrollLeft = Math.max(0, scrollArea.scrollLeft + dx)
    if (dy !== 0) scrollArea.scrollTop = Math.max(0, scrollArea.scrollTop + dy)
  }, [])

  const selectClipFromPointer = useCallback(
    (clipId: string, event: ReactPointerEvent<HTMLElement>): readonly string[] => {
      const isToggle = event.ctrlKey || event.metaKey
      if (!onSelectionChange) {
        onSelectClip(clipId)
        return [clipId]
      }
      if (event.shiftKey && activeClipId) {
        const ordered = [...resolvedClips].sort((a, b) =>
          a.timelineStart === b.timelineStart
            ? a.id.localeCompare(b.id)
            : a.timelineStart - b.timelineStart
        )
        const anchorIndex = ordered.findIndex((clip) => clip.id === activeClipId)
        const targetIndex = ordered.findIndex((clip) => clip.id === clipId)
        if (anchorIndex >= 0 && targetIndex >= 0) {
          const start = Math.min(anchorIndex, targetIndex)
          const end = Math.max(anchorIndex, targetIndex)
          const rangeIds = ordered.slice(start, end + 1).map((clip) => clip.id)
          const ids =
            event.ctrlKey || event.metaKey ? [...new Set([...selectedIds, ...rangeIds])] : rangeIds
          onSelectionChange(ids, clipId)
          return ids
        }
      }
      if (isToggle) {
        const next = new Set(selectedIds)
        if (next.has(clipId)) next.delete(clipId)
        else next.add(clipId)
        const ids = [...next]
        onSelectionChange(ids, next.has(clipId) ? clipId : (ids.at(-1) ?? null))
        return ids
      }
      if (selectedIds.has(clipId)) return [...selectedIds]
      onSelectionChange([clipId], clipId)
      return [clipId]
    },
    [activeClipId, onSelectClip, onSelectionChange, resolvedClips, selectedIds]
  )

  useEffect(() => {
    const keyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Space' && !event.repeat) {
        setSpacePressed(true)
        interactionController?.setSpacePressed(true)
      }
      if (event.key === 'Escape' && interaction) {
        setInteraction(null)
        interactionController?.cancel()
      }
    }
    const keyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') {
        setSpacePressed(false)
        interactionController?.setSpacePressed(false)
      }
    }
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
    }
  }, [interaction, interactionController])

  useEffect(() => {
    if (!interaction) return

    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== interaction.pointerId) return
      const scrollArea = scrollAreaRef.current
      if (!scrollArea) return

      if (interaction.mode === 'pan') {
        lastManualNavigationAtRef.current = Date.now()
        scrollArea.scrollLeft = Math.max(
          0,
          interaction.startScrollLeft - (event.clientX - interaction.startClientX)
        )
        scrollArea.scrollTop = Math.max(
          0,
          interaction.startScrollTop - (event.clientY - interaction.startClientY)
        )
        return
      }

      autoScrollForPointer(event.clientX, event.clientY)

      if (interaction.mode === 'select') {
        const exceeded =
          interaction.exceededThreshold ||
          hasExceededDragThreshold(
            { clientX: interaction.startClientX, clientY: interaction.startClientY },
            event.clientX,
            event.clientY
          )
        setInteraction({
          ...interaction,
          currentClientX: event.clientX,
          currentClientY: event.clientY,
          exceededThreshold: exceeded
        })
        if (exceeded && onSelectionChange) {
          const x1 = Math.min(interaction.startClientX, event.clientX)
          const x2 = Math.max(interaction.startClientX, event.clientX)
          const y1 = Math.min(interaction.startClientY, event.clientY)
          const y2 = Math.max(interaction.startClientY, event.clientY)
          const hits: string[] = []
          document
            .querySelectorAll<HTMLElement>('.studio-timeline__clip[data-clip-id]')
            .forEach((element) => {
              const rect = element.getBoundingClientRect()
              const intersects =
                rect.right >= x1 && rect.left <= x2 && rect.bottom >= y1 && rect.top <= y2
              if (intersects && element.dataset.clipId) hits.push(element.dataset.clipId)
            })
          const ids = interaction.append ? [...new Set([...selectedIds, ...hits])] : hits
          onSelectionChange(ids, ids.at(-1) ?? null)
        }
        return
      }

      const scrollDelta = scrollArea.scrollLeft - interaction.startScrollLeft
      const rawDeltaSeconds = (event.clientX - interaction.startClientX + scrollDelta) / zoom
      const exceeded =
        interaction.exceededThreshold ||
        Math.hypot(
          event.clientX - interaction.startClientX,
          event.clientY - interaction.startClientY
        ) >= EDITOR_DRAG_THRESHOLD_PX

      if (interaction.mode === 'move') {
        const minimumStart = Math.min(...interaction.group.map((clip) => clip.timelineStart))
        let delta = Math.max(-minimumStart, rawDeltaSeconds)
        let snapTarget: number | null = null
        const shouldSnap = snappingEnabled && !event.shiftKey
        if (shouldSnap) {
          const primaryStart = interaction.clip.timelineStart + delta
          const primaryEnd = primaryStart + interaction.clip.duration
          const threshold = SNAP_THRESHOLD_PX / zoom
          const startSnap = snapTimeToCandidates(primaryStart, snapCandidates, threshold)
          const endSnap = snapTimeToCandidates(primaryEnd, snapCandidates, threshold)
          if (startSnap.snapped || endSnap.snapped) {
            const startAdjustment = startSnap.time - primaryStart
            const endAdjustment = endSnap.time - primaryEnd
            const useStart =
              startSnap.snapped &&
              (!endSnap.snapped || Math.abs(startAdjustment) <= Math.abs(endAdjustment))
            const adjustment = useStart ? startAdjustment : endAdjustment
            delta = Math.max(-minimumStart, delta + adjustment)
            snapTarget = useStart ? startSnap.target : endSnap.target
          }
        }

        let previewTrackId = interaction.previewTrackId
        let previewNewLayer = false
        let isDropValid = true
        if (interaction.group.length === 1) {
          const targetTrack = findTrackAtClientY(event.clientY)
          const asset = assetsById.get(interaction.clip.assetId)
          if (targetTrack) {
            previewTrackId = targetTrack.id
            isDropValid =
              !targetTrack.locked && canMoveClipToTrack(asset?.kind ?? 'video', targetTrack.kind)
            if (isDropValid && isVisualTrack(targetTrack)) {
              const newStart = Math.max(0, interaction.clip.timelineStart + delta)
              if (
                trackWouldCollide(
                  pseudoProject,
                  targetTrack.id,
                  newStart,
                  interaction.clip.duration,
                  [interaction.clip.id]
                )
              ) {
                previewNewLayer = Boolean(onMoveClipToNewLayer)
              }
            }
          } else {
            const newLayerRect = newLayerDropRef.current?.getBoundingClientRect()
            const inNewLayerZone = Boolean(
              newLayerRect &&
              event.clientY >= newLayerRect.top &&
              event.clientY < newLayerRect.bottom
            )
            if (inNewLayerZone) {
              isDropValid = asset?.kind !== 'audio' && Boolean(onMoveClipToNewLayer)
              previewNewLayer = isDropValid
            }
          }
        }

        setInteraction({
          ...interaction,
          exceededThreshold: exceeded,
          previewDelta: delta,
          previewTrackId,
          previewNewLayer,
          isDropValid,
          snapTarget
        })
        return
      }

      const clip = interaction.clip
      if (interaction.mode === 'trim-left') {
        const maxDelta = clip.duration - MIN_CLIP_DURATION
        const minDelta = Math.max(-clip.sourceStart / clip.speed, -clip.timelineStart)
        let appliedDelta = clamp(rawDeltaSeconds, minDelta, maxDelta)
        let newTimelineStart = clip.timelineStart + appliedDelta
        let snapTarget: number | null = null
        if (snappingEnabled && !event.shiftKey) {
          const snap = snapTimeToCandidates(
            newTimelineStart,
            snapCandidates,
            SNAP_THRESHOLD_PX / zoom
          )
          if (snap.snapped) {
            appliedDelta = clamp(appliedDelta + (snap.time - newTimelineStart), minDelta, maxDelta)
            newTimelineStart = clip.timelineStart + appliedDelta
            snapTarget = snap.target
          }
        }
        setInteraction({
          ...interaction,
          exceededThreshold: exceeded,
          previewTimelineStart: newTimelineStart,
          previewSourceStart: clip.sourceStart + appliedDelta * clip.speed,
          previewDuration: Math.max(MIN_CLIP_DURATION, clip.duration - appliedDelta),
          snapTarget
        })
        return
      }

      const asset = assetsById.get(clip.assetId)
      const maxSourceEnd = Math.max(clip.sourceEnd, asset?.duration ?? clip.sourceEnd)
      const minDelta = -(clip.duration - MIN_CLIP_DURATION)
      const maxDelta = (maxSourceEnd - clip.sourceEnd) / clip.speed
      let appliedDelta = clamp(rawDeltaSeconds, minDelta, maxDelta)
      const originalEnd = clip.timelineStart + clip.duration
      let previewEnd = originalEnd + appliedDelta
      let snapTarget: number | null = null
      if (snappingEnabled && !event.shiftKey) {
        const snap = snapTimeToCandidates(previewEnd, snapCandidates, SNAP_THRESHOLD_PX / zoom)
        if (snap.snapped) {
          appliedDelta = clamp(appliedDelta + (snap.time - previewEnd), minDelta, maxDelta)
          previewEnd = originalEnd + appliedDelta
          snapTarget = snap.target
        }
      }
      setInteraction({
        ...interaction,
        exceededThreshold: exceeded,
        previewSourceEnd: clip.sourceEnd + appliedDelta * clip.speed,
        previewDuration: Math.max(MIN_CLIP_DURATION, previewEnd - clip.timelineStart),
        snapTarget
      })
    }

    const handlePointerUp = (event: PointerEvent): void => {
      if (event.pointerId !== interaction.pointerId) return
      if (interaction.mode === 'select') {
        if (!interaction.exceededThreshold) {
          if (!interaction.append) onSelectionChange?.([], null)
          onSetPlayhead?.(clientXToTime(event.clientX))
        }
        interactionController?.end()
        setInteraction(null)
        return
      }
      if (interaction.mode === 'pan') {
        interactionController?.end()
        setInteraction(null)
        return
      }
      if (!interaction.exceededThreshold) {
        if (interaction.mode === 'move') onSetPlayhead?.(interaction.clip.timelineStart)
        interactionController?.end()
        setInteraction(null)
        return
      }
      if (interaction.mode === 'move') {
        if (interaction.isDropValid) {
          if (interaction.group.length > 1 && onMoveClips) {
            onMoveClips(
              interaction.group.map((clip) => ({
                clipId: clip.id,
                timelineStart: Math.max(
                  0,
                  quantizeTime(clip.timelineStart + interaction.previewDelta)
                ),
                trackId: clip.trackId
              }))
            )
          } else {
            const start = Math.max(
              0,
              quantizeTime(interaction.clip.timelineStart + interaction.previewDelta)
            )
            if (interaction.previewNewLayer && onMoveClipToNewLayer) {
              onMoveClipToNewLayer(interaction.clip.id, start)
            } else {
              onMoveClip?.(interaction.clip.id, start, interaction.previewTrackId)
            }
          }
        }
      } else {
        onTrimClip?.(interaction.clip.id, {
          sourceStart: interaction.previewSourceStart,
          sourceEnd: interaction.previewSourceEnd,
          timelineStart: interaction.previewTimelineStart
        })
      }
      interactionController?.end()
      setInteraction(null)
    }

    const handlePointerCancel = (event: PointerEvent): void => {
      if (event.pointerId === interaction.pointerId) {
        interactionController?.cancel()
        setInteraction(null)
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [
    assetsById,
    autoScrollForPointer,
    clientXToTime,
    findTrackAtClientY,
    interaction,
    interactionController,
    onMoveClip,
    onMoveClips,
    onMoveClipToNewLayer,
    onSelectionChange,
    onSetPlayhead,
    onTrimClip,
    pseudoProject,
    selectedIds,
    snapCandidates,
    snappingEnabled,
    zoom
  ])

  const handleClipPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    clip: ResolvedTimelineClip
  ): void => {
    if (event.button !== 0 || !onMoveClip) return
    const track = tracks.find((item) => item.id === clip.trackId)
    if (track?.locked) return
    if (interactionController && !interactionController.begin('moving-clip', event.pointerId))
      return
    event.preventDefault()
    event.stopPropagation()
    const nextSelection = selectClipFromPointer(clip.id, event)
    const groupIds = nextSelection.includes(clip.id) ? nextSelection : [clip.id]
    const group = resolvedClips.filter((item) => groupIds.includes(item.id))
    const scrollArea = scrollAreaRef.current
    setInteraction({
      mode: 'move',
      pointerId: event.pointerId,
      clip,
      group: group.length > 0 ? group : [clip],
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: scrollArea?.scrollLeft ?? 0,
      exceededThreshold: false,
      previewDelta: 0,
      previewTrackId: clip.trackId,
      previewNewLayer: false,
      isDropValid: true,
      snapTarget: null
    })
  }

  const startTrim = (
    event: ReactPointerEvent<HTMLSpanElement>,
    clip: ResolvedTimelineClip,
    mode: 'trim-left' | 'trim-right'
  ): void => {
    if (!onTrimClip) return
    const track = tracks.find((item) => item.id === clip.trackId)
    if (track?.locked) return
    const globalMode = mode === 'trim-left' ? 'trimming-left' : 'trimming-right'
    if (interactionController && !interactionController.begin(globalMode, event.pointerId)) return
    event.preventDefault()
    event.stopPropagation()
    onSelectionChange?.([clip.id], clip.id)
    onSelectClip(clip.id)
    const scrollArea = scrollAreaRef.current
    setInteraction({
      mode,
      pointerId: event.pointerId,
      clip,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: scrollArea?.scrollLeft ?? 0,
      exceededThreshold: false,
      previewTimelineStart: clip.timelineStart,
      previewSourceStart: clip.sourceStart,
      previewSourceEnd: clip.sourceEnd,
      previewDuration: clip.duration,
      snapTarget: null
    })
  }

  const startPan = (event: ReactPointerEvent<HTMLElement>): void => {
    const scrollArea = scrollAreaRef.current
    if (!scrollArea) return
    if (interactionController && !interactionController.begin('panning-timeline', event.pointerId))
      return
    if (event.button === 0 && spacePressed) interactionController?.markSpaceGestureUsed()
    event.preventDefault()
    setInteraction({
      mode: 'pan',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: scrollArea.scrollLeft,
      startScrollTop: scrollArea.scrollTop
    })
  }

  const startSelection = (event: ReactPointerEvent<HTMLElement>): void => {
    const scrollArea = scrollAreaRef.current
    if (!scrollArea) return
    if (interactionController && !interactionController.begin('box-selecting', event.pointerId))
      return
    setInteraction({
      mode: 'select',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      startScrollLeft: scrollArea.scrollLeft,
      startScrollTop: scrollArea.scrollTop,
      append: event.ctrlKey || event.metaKey || event.shiftKey,
      exceededThreshold: false
    })
  }

  const handleTimelinePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement
    if (
      target.closest('.studio-timeline__clip') ||
      target.closest('.studio-timeline__playhead-handle') ||
      target.closest('.studio-timeline__layer-controls') ||
      target.closest('.studio-timeline__new-layer-drop')
    ) {
      return
    }
    if (event.button === 1 || (event.button === 0 && spacePressed)) {
      startPan(event)
      return
    }
    if (event.button !== 0) return
    startSelection(event)
  }

  const handleRulerPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button === 1 || (event.button === 0 && spacePressed)) {
      startPan(event)
      return
    }
    if (event.button !== 0) return
    if (
      interactionController &&
      !interactionController.begin('scrubbing-playhead', event.pointerId)
    )
      return
    event.preventDefault()
    onSetPlayhead?.(clientXToTime(event.clientX))
    const pointerId = event.pointerId
    const move = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== pointerId) return
      onSetPlayhead?.(clientXToTime(moveEvent.clientX))
      autoScrollForPointer(moveEvent.clientX, moveEvent.clientY)
    }
    const up = (upEvent: PointerEvent): void => {
      if (upEvent.pointerId !== pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      interactionController?.end('scrubbing-playhead')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  useEffect(() => {
    const scrollArea = scrollAreaRef.current
    if (!scrollArea || Date.now() - lastManualNavigationAtRef.current < 1400) return
    const visibleStart = scrollArea.scrollLeft / zoom
    const visibleEnd = (scrollArea.scrollLeft + scrollArea.clientWidth) / zoom
    const rightGuard = Math.max(0.5, 96 / zoom)
    const leftGuard = Math.max(0.25, 28 / zoom)
    if (playhead > visibleEnd - rightGuard || playhead < visibleStart + leftGuard) {
      scrollArea.scrollLeft = Math.max(0, playhead * zoom - scrollArea.clientWidth * 0.68)
    }
  }, [playhead, zoom])

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
    lastManualNavigationAtRef.current = Date.now()
    const scrollArea = scrollAreaRef.current
    if (!scrollArea) return
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      const rect = scrollArea.getBoundingClientRect()
      const localX = event.clientX - rect.left
      const anchorTime = Math.max(0, (scrollArea.scrollLeft + localX) / zoom)
      const factor = event.deltaY < 0 ? 1.12 : 0.89
      const nextZoom = clamp(zoom * factor, MIN_TIMELINE_ZOOM, MAX_TIMELINE_ZOOM)
      if (Math.abs(nextZoom - zoom) < 0.01) return
      onZoomChange?.(Math.round(nextZoom))
      requestAnimationFrame(() => {
        if (!scrollAreaRef.current) return
        scrollAreaRef.current.scrollLeft = Math.max(0, anchorTime * nextZoom - localX)
      })
      return
    }
    if (event.shiftKey) {
      event.preventDefault()
      scrollArea.scrollLeft +=
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    }
  }

  const getDropPlacement = (
    event: ReactDragEvent<HTMLElement>,
    explicitNewLayer = false
  ): AssetDropPreview => {
    const targetTrack = explicitNewLayer ? null : findTrackAtClientY(event.clientY)
    const hasAsset = Array.from(event.dataTransfer.types).includes(EDITOR_ASSET_DRAG_MIME)
    const hasFiles = containsExternalFiles(event.dataTransfer)
    const isVisualTarget = explicitNewLayer || Boolean(targetTrack && isVisualTrack(targetTrack))
    const isAudioTarget = Boolean(targetTrack?.kind === 'audio')
    const valid = hasAsset
      ? Boolean(targetTrack || explicitNewLayer)
      : hasFiles && isVisualTarget && !isAudioTarget
    return {
      trackId: targetTrack?.id ?? null,
      newVisualLayer: explicitNewLayer,
      timelineStart: clientXToTime(event.clientX),
      valid
    }
  }

  const handleDragOver = (event: ReactDragEvent<HTMLElement>, explicitNewLayer = false): void => {
    const hasAsset = Array.from(event.dataTransfer.types).includes(EDITOR_ASSET_DRAG_MIME)
    const hasFiles = containsExternalFiles(event.dataTransfer)
    if (!hasAsset && !hasFiles) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    const placement = getDropPlacement(event, explicitNewLayer)
    setAssetDropPreview(placement)
    autoScrollForPointer(event.clientX, event.clientY)
  }

  const handleDrop = (event: ReactDragEvent<HTMLElement>, explicitNewLayer = false): void => {
    const placement = getDropPlacement(event, explicitNewLayer)
    if (!placement.valid) {
      setAssetDropPreview(null)
      return
    }
    event.preventDefault()
    const assetPayload = readEditorAssetDragData(event.dataTransfer)
    if (assetPayload) {
      if (placement.newVisualLayer) {
        onAddMediaToNewLayer?.(assetPayload.assetId, placement.timelineStart)
      } else {
        onAddMediaAt?.(
          assetPayload.assetId,
          placement.timelineStart,
          placement.trackId ?? undefined
        )
      }
      setAssetDropPreview(null)
      return
    }
    const files = Array.from(event.dataTransfer.files ?? []).filter((file) =>
      file.type.startsWith('video/')
    )
    if (files.length > 0) {
      onExternalFilesDrop?.(files, {
        timelineStart: placement.timelineStart,
        trackId: placement.trackId ?? undefined,
        newVisualLayer: placement.newVisualLayer
      })
    }
    setAssetDropPreview(null)
  }

  const fitTimeline = useCallback((): void => {
    const scrollArea = scrollAreaRef.current
    if (!scrollArea || projectDuration <= 0) return
    const available = Math.max(100, scrollArea.clientWidth - 32)
    const nextZoom = clamp(
      available / Math.max(projectDuration, 1),
      MIN_TIMELINE_ZOOM,
      MAX_TIMELINE_ZOOM
    )
    onZoomChange?.(Math.round(nextZoom))
    scrollArea.scrollLeft = 0
  }, [onZoomChange, projectDuration])

  const getClipDisplay = (
    clip: ResolvedTimelineClip
  ): { start: number; duration: number; trackId: string } => {
    if (interaction?.mode === 'move') {
      const groupClip = interaction.group.find((item) => item.id === clip.id)
      if (groupClip) {
        return {
          start: Math.max(0, groupClip.timelineStart + interaction.previewDelta),
          duration: groupClip.duration,
          trackId:
            interaction.group.length === 1 && groupClip.id === interaction.clip.id
              ? interaction.previewTrackId
              : groupClip.trackId
        }
      }
    }
    if (
      interaction &&
      (interaction.mode === 'trim-left' || interaction.mode === 'trim-right') &&
      interaction.clip.id === clip.id
    ) {
      return {
        start: interaction.previewTimelineStart,
        duration: interaction.previewDuration,
        trackId: clip.trackId
      }
    }
    return { start: clip.timelineStart, duration: clip.duration, trackId: clip.trackId }
  }

  const openClipContextMenu = (event: ReactMouseEvent, clip: ResolvedTimelineClip): void => {
    event.preventDefault()
    event.stopPropagation()
    if (!selectedIds.has(clip.id)) {
      onSelectionChange?.([clip.id], clip.id)
      onSelectClip(clip.id)
    }
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      kind: 'clip',
      clipId: clip.id,
      time: clientXToTime(event.clientX)
    })
  }

  const renderClip = (clip: ResolvedTimelineClip): JSX.Element => {
    const asset = assetsById.get(clip.assetId)
    const display = getClipDisplay(clip)
    const isSelected = selectedIds.has(clip.id)
    const isPrimaryDragging = interaction?.mode === 'move' && interaction.clip.id === clip.id
    const style: TimelineCssProperties = {
      '--clip-left': `${display.start * zoom}px`,
      '--clip-width': `${Math.max(44, display.duration * zoom)}px`
    }
    const track = tracks.find((item) => item.id === display.trackId)
    const locked = track?.locked === true
    return (
      <button
        key={clip.id}
        className="studio-timeline__clip"
        type="button"
        style={style}
        data-clip-id={clip.id}
        data-selected={isSelected ? 'true' : undefined}
        data-dragging={isPrimaryDragging && interaction.exceededThreshold ? 'true' : undefined}
        data-disabled={!clip.enabled ? 'true' : undefined}
        aria-pressed={isSelected}
        aria-label={`${asset?.name ?? '未知素材'} ${formatTimecode(display.duration, 0)}`}
        title={`${asset?.name ?? '未知素材'} · ${formatTimecode(display.duration)}`}
        onContextMenu={(event) => openClipContextMenu(event, clip)}
        onPointerDown={(event) => handleClipPointerDown(event, clip)}
      >
        {asset?.kind !== 'audio' && asset?.url && (
          <VideoThumbnailStrip
            url={asset.url}
            duration={asset.duration}
            sourceStart={clip.sourceStart}
            sourceEnd={clip.sourceEnd}
            pixelWidth={Math.max(1, display.duration * zoom)}
            enabled={asset.status === 'ready'}
          />
        )}
        <span className="studio-timeline__clip-shade" aria-hidden="true" />
        <span
          className="studio-timeline__trim-handle studio-timeline__trim-handle--left"
          aria-hidden="true"
          onPointerDown={(event) => startTrim(event, clip, 'trim-left')}
        />
        <span className="studio-timeline__clip-label">
          <strong>{asset?.name ?? '未知素材'}</strong>
          <time>{formatTimecode(display.duration, 1)}</time>
        </span>
        {locked && <Lock className="studio-timeline__clip-lock" size={12} aria-hidden="true" />}
        <span
          className="studio-timeline__trim-handle studio-timeline__trim-handle--right"
          aria-hidden="true"
          onPointerDown={(event) => startTrim(event, clip, 'trim-right')}
        />
      </button>
    )
  }

  const selectionBox = useMemo(() => {
    if (!interaction || interaction.mode !== 'select' || !interaction.exceededThreshold) return null
    // Selection box 使用 position: fixed，因此必须保持 client coordinate。
    // 实际 Clip 命中检测同样基于 getBoundingClientRect()，避免滚动后视觉框与命中区域错位。
    return {
      left: Math.min(interaction.startClientX, interaction.currentClientX),
      top: Math.min(interaction.startClientY, interaction.currentClientY),
      width: Math.abs(interaction.currentClientX - interaction.startClientX),
      height: Math.abs(interaction.currentClientY - interaction.startClientY)
    }
  }, [interaction])

  const interactionSnapTarget =
    interaction &&
    (interaction.mode === 'move' ||
      interaction.mode === 'trim-left' ||
      interaction.mode === 'trim-right')
      ? interaction.snapTarget
      : null

  const contextItems = useMemo<EditorContextMenuItem[]>(() => {
    if (!contextMenu) return []
    if (contextMenu.kind === 'blank') {
      return [
        {
          id: 'paste',
          label: '粘贴到这里',
          shortcut: 'Ctrl+V',
          icon: <ClipboardPaste size={14} />,
          disabled: !canPaste,
          onSelect: () => onPaste?.(contextMenu.time)
        },
        { id: 'sep', separator: true },
        { id: 'fit', label: '缩放到全部内容', icon: <ZoomOut size={14} />, onSelect: fitTimeline }
      ]
    }
    if (contextMenu.kind === 'track' && contextMenu.trackId) {
      const track = tracks.find((item) => item.id === contextMenu.trackId)
      if (!track) return []
      return [
        {
          id: 'lock',
          label: track.locked ? '解锁内容层' : '锁定内容层',
          icon: track.locked ? <Unlock size={14} /> : <Lock size={14} />,
          onSelect: () => onUpdateTrack?.(track.id, { locked: !track.locked })
        },
        ...(track.kind !== 'audio'
          ? [
              {
                id: 'visibility',
                label: track.hidden ? '显示内容层' : '隐藏内容层',
                icon: track.hidden ? <Eye size={14} /> : <EyeOff size={14} />,
                onSelect: () => onUpdateTrack?.(track.id, { hidden: !track.hidden })
              } satisfies EditorContextMenuItem
            ]
          : []),
        {
          id: 'mute-track',
          label: track.muted ? '取消静音' : '静音内容层',
          icon: track.muted ? <Volume2 size={14} /> : <VolumeX size={14} />,
          onSelect: () => onUpdateTrack?.(track.id, { muted: !track.muted })
        }
      ]
    }
    const clip = resolvedClips.find((item) => item.id === contextMenu.clipId)
    if (!clip) return []
    const ids = selectedIds.has(clip.id) ? [...selectedIds] : [clip.id]
    const canSplit =
      contextMenu.time > clip.timelineStart + MIN_CLIP_DURATION &&
      contextMenu.time < clip.timelineStart + clip.duration - MIN_CLIP_DURATION
    return [
      {
        id: 'split',
        label: '分割',
        shortcut: 'Ctrl+B',
        icon: <Scissors size={14} />,
        disabled: !canSplit,
        onSelect: () => onSplitClip?.(clip.id, contextMenu.time)
      },
      { id: 'sep-1', separator: true },
      {
        id: 'cut',
        label: '剪切',
        shortcut: 'Ctrl+X',
        icon: <Scissors size={14} />,
        onSelect: () => onCutClips?.(ids)
      },
      {
        id: 'copy',
        label: '复制',
        shortcut: 'Ctrl+C',
        icon: <Copy size={14} />,
        onSelect: () => onCopyClips?.(ids)
      },
      {
        id: 'duplicate',
        label: '复制片段',
        shortcut: 'Ctrl+D',
        icon: <Copy size={14} />,
        onSelect: () => onDuplicateClips?.(ids)
      },
      { id: 'sep-2', separator: true },
      {
        id: 'mute',
        label: clip.muted ? '取消片段静音' : '片段静音',
        icon: clip.muted ? <Volume2 size={14} /> : <VolumeX size={14} />,
        onSelect: () => onToggleClipMute?.(clip.id)
      },
      {
        id: 'enabled',
        label: clip.enabled ? '禁用片段' : '启用片段',
        icon: clip.enabled ? <EyeOff size={14} /> : <Eye size={14} />,
        onSelect: () => onToggleClipEnabled?.(clip.id)
      },
      {
        id: 'reset',
        label: '重置画面',
        icon: <RotateCcw size={14} />,
        onSelect: () => onResetClipTransform?.(clip.id)
      },
      { id: 'sep-3', separator: true },
      {
        id: 'delete',
        label: '删除',
        shortcut: 'Delete',
        icon: <Trash2 size={14} />,
        danger: true,
        onSelect: () => (onDeleteClips ? onDeleteClips(ids) : onDeleteClip?.(clip.id))
      }
    ]
  }, [
    canPaste,
    contextMenu,
    fitTimeline,
    onCopyClips,
    onCutClips,
    onDeleteClip,
    onDeleteClips,
    onDuplicateClips,
    onPaste,
    onResetClipTransform,
    onSplitClip,
    onToggleClipEnabled,
    onToggleClipMute,
    onUpdateTrack,
    resolvedClips,
    selectedIds,
    tracks
  ])

  return (
    <section className="studio-timeline" aria-label="时间线">
      <header className="studio-timeline__toolbar">
        <div className="studio-timeline__toolbar-group">
          <button
            type="button"
            title="撤销 Ctrl+Z"
            aria-label="撤销"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="重做 Ctrl+Shift+Z"
            aria-label="重做"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 size={15} aria-hidden="true" />
          </button>
        </div>
        <span className="studio-timeline__toolbar-divider" />
        <div className="studio-timeline__toolbar-group">
          <button
            type="button"
            title="在播放头处分割 Ctrl+B"
            aria-label="分割片段"
            disabled={!canSplitActiveClip}
            onClick={() => activeClip && onSplitClip?.(activeClip.id, playhead)}
          >
            <Scissors size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="删除 Delete"
            aria-label="删除片段"
            disabled={selectedIds.size === 0}
            onClick={() => {
              const ids = [...selectedIds]
              if (onDeleteClips) onDeleteClips(ids)
              else if (activeClip) onDeleteClip?.(activeClip.id)
            }}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="studio-timeline__toolbar-spacer" />
        <span className="studio-timeline__playhead-time">{formatTimecode(playhead)}</span>
        <span className="studio-timeline__toolbar-divider" />
        <button
          type="button"
          className="studio-timeline__snap-button"
          data-active={snappingEnabled ? 'true' : undefined}
          aria-label="吸附"
          aria-pressed={snappingEnabled}
          title="吸附（拖动时按住 Shift 临时关闭）"
          onClick={() => onSnappingChange?.(!snappingEnabled)}
        >
          <Magnet size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="studio-timeline__snap-button"
          data-active={magnetEnabled ? 'true' : undefined}
          aria-label="磁吸"
          aria-pressed={magnetEnabled}
          title="主内容磁吸：删除中间片段后自动前贴"
          onClick={() => onMagnetChange?.(!magnetEnabled)}
        >
          <Magnet size={14} aria-hidden="true" />
        </button>
        <div className="studio-timeline__toolbar-group">
          <button
            type="button"
            title="缩小时间线"
            aria-label="缩小时间线"
            disabled={zoom <= MIN_TIMELINE_ZOOM}
            onClick={() => onZoomChange?.(Math.max(MIN_TIMELINE_ZOOM, zoom - 12))}
          >
            <ZoomOut size={15} aria-hidden="true" />
          </button>
          <input
            aria-label="时间线缩放"
            type="range"
            min={MIN_TIMELINE_ZOOM}
            max={MAX_TIMELINE_ZOOM}
            step={4}
            value={zoom}
            onChange={(event) => onZoomChange?.(Number(event.currentTarget.value))}
          />
          <button
            type="button"
            title="放大时间线"
            aria-label="放大时间线"
            disabled={zoom >= MAX_TIMELINE_ZOOM}
            onClick={() => onZoomChange?.(Math.min(MAX_TIMELINE_ZOOM, zoom + 12))}
          >
            <ZoomIn size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div
        className="studio-timeline__editor"
        data-main-centered={isMainTrackCentered ? 'true' : undefined}
      >
        <div
          ref={trackHeadersRef}
          className="studio-timeline__track-headers"
          aria-label="内容层控制"
        >
          <div className="studio-timeline__ruler-corner" aria-hidden="true" />
          <div className="studio-timeline__new-layer-gutter" aria-hidden="true" />
          {displayTracks.map((track) => (
            <div
              className="studio-timeline__track-header"
              key={track.id}
              data-main={track.role === 'main' ? 'true' : undefined}
              onContextMenu={(event) => {
                event.preventDefault()
                setContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  kind: 'track',
                  trackId: track.id,
                  time: playhead
                })
              }}
            >
              <span className="studio-timeline__track-kind" aria-hidden="true">
                {track.kind === 'audio' ? (
                  <Volume2 size={13} />
                ) : track.role === 'main' ? (
                  <Video size={13} />
                ) : (
                  <Layers2 size={13} />
                )}
              </span>
              <div className="studio-timeline__layer-controls">
                <button
                  type="button"
                  title={track.locked ? '解锁' : '锁定'}
                  aria-label={track.locked ? `解锁${track.name}` : `锁定${track.name}`}
                  onClick={() => onUpdateTrack?.(track.id, { locked: !track.locked })}
                >
                  {track.locked ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
                {track.kind !== 'audio' && (
                  <button
                    type="button"
                    title={track.hidden ? '显示' : '隐藏'}
                    aria-label={track.hidden ? `显示${track.name}` : `隐藏${track.name}`}
                    onClick={() => onUpdateTrack?.(track.id, { hidden: !track.hidden })}
                  >
                    {track.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                )}
                <button
                  type="button"
                  title={track.muted ? '取消静音' : '静音'}
                  aria-label={track.muted ? `取消静音${track.name}` : `静音${track.name}`}
                  onClick={() => onUpdateTrack?.(track.id, { muted: !track.muted })}
                >
                  {track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div
          ref={scrollAreaRef}
          className="studio-timeline__scroll-area"
          onWheel={handleWheel}
          onScroll={(event) => {
            if (trackHeadersRef.current)
              trackHeadersRef.current.scrollTop = event.currentTarget.scrollTop
            updateVisibleTimeRange()
          }}
          onContextMenu={(event) => {
            const target = event.target as HTMLElement
            if (target.closest('.studio-timeline__clip')) return
            event.preventDefault()
            setContextMenu({
              x: event.clientX,
              y: event.clientY,
              kind: 'blank',
              time: clientXToTime(event.clientX)
            })
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              setAssetDropPreview(null)
          }}
        >
          <div
            className="studio-timeline__canvas"
            style={timelineCanvasStyle}
            onPointerDown={handleTimelinePointerDown}
            onDragOver={(event) => handleDragOver(event, false)}
            onDrop={(event) => handleDrop(event, false)}
          >
            <Ruler duration={timelineDuration} zoom={zoom} onPointerDown={handleRulerPointerDown} />

            <div
              ref={newLayerDropRef}
              className="studio-timeline__new-layer-drop"
              data-active={
                assetDropPreview?.newVisualLayer ||
                (interaction?.mode === 'move' && interaction.previewNewLayer)
                  ? 'true'
                  : undefined
              }
              onDragOver={(event) => {
                event.stopPropagation()
                handleDragOver(event, true)
              }}
              onDrop={(event) => {
                event.stopPropagation()
                handleDrop(event, true)
              }}
            >
              <span>+ 放在新的一层</span>
            </div>

            <div
              className="studio-timeline__playhead"
              style={{ left: `${Math.min(timelineWidth, playhead * zoom)}px` }}
              aria-hidden="true"
            />
            <button
              type="button"
              className="studio-timeline__playhead-handle"
              aria-label="拖动播放头"
              title={formatTimecode(playhead)}
              style={{ left: `${Math.min(timelineWidth, playhead * zoom)}px` }}
              onPointerDown={handleRulerPointerDown}
            >
              <span />
            </button>

            {interactionSnapTarget !== null && (
              <div
                className="studio-timeline__snap-guide"
                style={{ left: `${interactionSnapTarget * zoom}px` }}
                aria-hidden="true"
              />
            )}

            {displayTracks.map((track) => {
              const isDropPreview =
                assetDropPreview?.trackId === track.id ||
                (interaction?.mode === 'move' && interaction.previewTrackId === track.id)
              const interactionInvalid =
                interaction?.mode === 'move' &&
                interaction.previewTrackId === track.id &&
                !interaction.isDropValid
              return (
                <div
                  className="studio-timeline__track-row"
                  key={track.id}
                  ref={(element) => {
                    if (element) trackRowsRef.current.set(track.id, element)
                    else trackRowsRef.current.delete(track.id)
                  }}
                  data-track-id={track.id}
                  data-main={track.role === 'main' ? 'true' : undefined}
                  data-locked={track.locked ? 'true' : undefined}
                  data-hidden={track.hidden ? 'true' : undefined}
                  data-drop-target={isDropPreview && !interactionInvalid ? 'true' : undefined}
                  data-drop-invalid={interactionInvalid ? 'true' : undefined}
                  onDragOver={(event) => {
                    event.stopPropagation()
                    handleDragOver(event, false)
                  }}
                  onDrop={(event) => {
                    event.stopPropagation()
                    handleDrop(event, false)
                  }}
                >
                  {interaction?.mode === 'move' &&
                    interaction.exceededThreshold &&
                    interaction.group
                      .filter((clip) => clip.trackId === track.id)
                      .map((clip) => (
                        <div
                          key={`ghost-${clip.id}`}
                          className="studio-timeline__clip-origin-ghost"
                          style={
                            {
                              '--clip-left': `${clip.timelineStart * zoom}px`,
                              '--clip-width': `${Math.max(44, clip.duration * zoom)}px`
                            } as TimelineCssProperties
                          }
                          aria-hidden="true"
                        />
                      ))}
                  {resolvedClips
                    .filter((clip) => {
                      const display = getClipDisplay(clip)
                      if (display.trackId !== track.id) return false
                      if (selectedIds.has(clip.id)) return true
                      if (
                        interaction?.mode === 'move' &&
                        interaction.group.some((item) => item.id === clip.id)
                      )
                        return true
                      return (
                        display.start + display.duration >= visibleTimeRange.start &&
                        display.start <= visibleTimeRange.end
                      )
                    })
                    .map((clip) => renderClip(clip))}
                  {track.role === 'main' && (clipsByTrack.get(track.id)?.length ?? 0) === 0 && (
                    <div className="studio-timeline__main-empty" aria-hidden="true">
                      把视频拖到这里开始剪辑
                    </div>
                  )}
                </div>
              )
            })}

            {selectionBox && (
              <div className="studio-timeline__selection-box" style={selectionBox} />
            )}
          </div>
        </div>
      </div>

      {interaction?.mode === 'move' && interaction.exceededThreshold && (
        <div className="studio-timeline__drag-readout">
          {interaction.previewNewLayer ? '新视觉层 · ' : ''}
          {formatTimecode(Math.max(0, interaction.clip.timelineStart + interaction.previewDelta))}
        </div>
      )}
      {interaction &&
        (interaction.mode === 'trim-left' || interaction.mode === 'trim-right') &&
        interaction.exceededThreshold && (
          <div className="studio-timeline__drag-readout">
            {interaction.mode === 'trim-left' ? '入点' : '出点'} ·{' '}
            {formatTimecode(
              interaction.mode === 'trim-left'
                ? interaction.previewSourceStart
                : interaction.previewSourceEnd,
              3
            )}{' '}
            · 时长 {formatTimecode(interaction.previewDuration, 3)}
          </div>
        )}

      {contextMenu && (
        <EditorContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextItems}
          onClose={() => setContextMenu(null)}
          ariaLabel="时间线快捷菜单"
        />
      )}

      {rows && onUpdateRow && onAddRow && onDeleteRow && (
        <LegacyDraftRows
          rows={rows}
          onUpdateRow={onUpdateRow}
          onAddRow={onAddRow}
          onDeleteRow={onDeleteRow}
        />
      )}
    </section>
  )
}

function Ruler({
  duration,
  zoom,
  onPointerDown
}: {
  duration: number
  zoom: number
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
}): JSX.Element {
  const step = getRulerStep(zoom)
  const subdivisions = 10
  const markers = Array.from(
    { length: Math.floor(duration / step) + 1 },
    (_, index) => index * step
  )
  const rulerStyle: TimelineRulerCssProperties = {
    '--timeline-ruler-minor-step': `${(step * zoom) / subdivisions}px`
  }
  return (
    <div
      className="studio-timeline__ruler"
      aria-label="时间尺"
      style={rulerStyle}
      onPointerDown={onPointerDown}
    >
      {markers.map((second) => (
        <span
          className="studio-timeline__ruler-mark"
          key={second}
          style={{ left: `${second * zoom}px` }}
        >
          <span className="studio-timeline__ruler-tick studio-timeline__ruler-tick--major" />
          <span className="studio-timeline__ruler-label">{formatTimecode(second, 0)}</span>
        </span>
      ))}
    </div>
  )
}

function LegacyDraftRows({
  rows,
  onUpdateRow,
  onAddRow,
  onDeleteRow
}: {
  rows: DraftRow[]
  onUpdateRow: (rowId: string, updates: Partial<Omit<DraftRow, 'id'>>) => void
  onAddRow: (afterRowId: string) => void
  onDeleteRow: (rowId: string) => void
}): JSX.Element {
  return (
    <form className="studio-timeline__legacy-drafts" onSubmit={(event) => event.preventDefault()}>
      {rows.map((row, index) => (
        <div key={row.id} className="studio-timeline__legacy-row">
          <input
            name="draftName"
            type="text"
            aria-label="草稿名"
            placeholder="请输入草稿名"
            value={row.draftName}
            onChange={(event) => onUpdateRow(row.id, { draftName: event.target.value })}
          />
          <label>
            <Upload size={14} aria-hidden="true" />
            <span>{row.fixedStartFileName}</span>
            <input
              type="file"
              accept="video/*"
              aria-label="上传固定开头"
              onChange={(event) =>
                onUpdateRow(row.id, {
                  fixedStartFileName: event.currentTarget.files?.[0]?.name ?? '选择视频'
                })
              }
            />
          </label>
          <button
            type="button"
            aria-label={`在第 ${index + 1} 行后新增`}
            onClick={() => onAddRow(row.id)}
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            aria-label={`删除第 ${index + 1} 行`}
            disabled={rows.length === 1}
            onClick={() => onDeleteRow(row.id)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </form>
  )
}

export default Timeline
