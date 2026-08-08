import type { CSSProperties, JSX, PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Eye,
  EyeOff,
  Lock,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  Plus,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import {
  MAX_TIMELINE_ZOOM,
  MIN_CLIP_DURATION,
  MIN_TIMELINE_ZOOM,
  getProjectDuration,
  resolveTimelineClip,
  type DraftRow,
  type EditorProjectState,
  type EditorTrack,
  type MediaAsset,
  type ResolvedTimelineClip,
  type TimelineClip
} from './editorProject'
import './Timeline.css'

interface TimelineProps {
  clips: TimelineClip[]
  assets: MediaAsset[]
  activeClipId: string | null
  tracks?: EditorTrack[]
  playhead?: number
  zoom?: number
  canUndo?: boolean
  canRedo?: boolean
  onSelectClip: (clipId: string) => void
  onSetPlayhead?: (time: number) => void
  onMoveClip?: (clipId: string, timelineStart: number, trackId?: string) => void
  onTrimClip?: (
    clipId: string,
    trim: { sourceStart: number; sourceEnd: number; timelineStart?: number }
  ) => void
  onSplitClip?: (clipId: string, at: number) => void
  onDeleteClip?: (clipId: string) => void
  onUpdateTrack?: (
    trackId: string,
    patch: Partial<Pick<EditorTrack, 'locked' | 'hidden' | 'muted' | 'name'>>
  ) => void
  onZoomChange?: (zoom: number) => void
  onUndo?: () => void
  onRedo?: () => void

  /** 兼容旧版测试/草稿设置，工作区 V1 不再传这些 props。 */
  rows?: DraftRow[]
  onUpdateRow?: (rowId: string, updates: Partial<Omit<DraftRow, 'id'>>) => void
  onAddRow?: (afterRowId: string) => void
  onDeleteRow?: (rowId: string) => void
}

interface DragState {
  pointerId: number
  mode: 'move' | 'trim-left' | 'trim-right'
  clip: ResolvedTimelineClip
  startClientX: number
  previewTimelineStart: number
  previewSourceStart: number
  previewSourceEnd: number
  previewDuration: number
}

interface TimelineCssProperties extends CSSProperties {
  '--timeline-width': string
  '--clip-left': string
  '--clip-width': string
  '--playhead-left': string
}

interface TimelineCanvasCssProperties extends CSSProperties {
  '--timeline-grid-size': string
}

const LEGACY_TRACKS: EditorTrack[] = [
  {
    id: 'track-video-main',
    name: 'V1',
    kind: 'video',
    locked: false,
    hidden: false,
    muted: false
  }
]

const formatDuration = (duration: number | null | undefined): string => {
  if (duration === null || duration === undefined || !Number.isFinite(duration)) return '--:--'
  const totalSeconds = Math.max(0, Math.floor(duration))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const minuteText = String(minutes).padStart(2, '0')
  const secondText = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${minuteText}:${secondText}` : `${minuteText}:${secondText}`
}

function Timeline({
  clips,
  assets,
  activeClipId,
  tracks = LEGACY_TRACKS,
  playhead = 0,
  zoom = 72,
  canUndo = false,
  canRedo = false,
  onSelectClip,
  onSetPlayhead,
  onMoveClip,
  onTrimClip,
  onSplitClip,
  onDeleteClip,
  onUpdateTrack,
  onZoomChange,
  onUndo,
  onRedo,
  rows,
  onUpdateRow,
  onAddRow,
  onDeleteRow
}: TimelineProps): JSX.Element {
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets])
  const [dragState, setDragState] = useState<DragState | null>(null)
  const trackHeadersRef = useRef<HTMLDivElement>(null)

  const resolvedClips = useMemo(
    () =>
      clips.map((clip) => resolveTimelineClip(clip, assetsById.get(clip.assetId) ?? null)),
    [assetsById, clips]
  )

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
  const timelineCanvasStyle: TimelineCanvasCssProperties = {
    width: timelineWidth,
    '--timeline-grid-size': `${zoom}px`
  }

  useEffect(() => {
    if (!dragState) return

    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== dragState.pointerId) return
      const deltaSeconds = (event.clientX - dragState.startClientX) / zoom
      const clip = dragState.clip

      if (dragState.mode === 'move') {
        setDragState((current) =>
          current
            ? {
                ...current,
                previewTimelineStart: snapTime(Math.max(0, clip.timelineStart + deltaSeconds))
              }
            : current
        )
        return
      }

      if (dragState.mode === 'trim-left') {
        const maxDelta = clip.duration - MIN_CLIP_DURATION
        const appliedDelta = clamp(deltaSeconds, -clip.sourceStart / clip.speed, maxDelta)
        const sourceStart = clip.sourceStart + appliedDelta * clip.speed
        setDragState((current) =>
          current
            ? {
                ...current,
                previewTimelineStart: Math.max(0, clip.timelineStart + appliedDelta),
                previewSourceStart: sourceStart,
                previewDuration: Math.max(MIN_CLIP_DURATION, clip.duration - appliedDelta)
              }
            : current
        )
        return
      }

      const asset = assetsById.get(clip.assetId)
      const maxSourceEnd = Math.max(clip.sourceEnd, asset?.duration ?? clip.sourceEnd)
      const minDelta = -(clip.duration - MIN_CLIP_DURATION)
      const maxDelta = (maxSourceEnd - clip.sourceEnd) / clip.speed
      const appliedDelta = clamp(deltaSeconds, minDelta, maxDelta)
      setDragState((current) =>
        current
          ? {
              ...current,
              previewSourceEnd: clip.sourceEnd + appliedDelta * clip.speed,
              previewDuration: Math.max(MIN_CLIP_DURATION, clip.duration + appliedDelta)
            }
          : current
      )
    }

    const handlePointerUp = (event: PointerEvent): void => {
      if (event.pointerId !== dragState.pointerId) return

      if (dragState.mode === 'move') {
        onMoveClip?.(dragState.clip.id, dragState.previewTimelineStart)
      } else {
        onTrimClip?.(dragState.clip.id, {
          sourceStart: dragState.previewSourceStart,
          sourceEnd: dragState.previewSourceEnd,
          timelineStart: dragState.previewTimelineStart
        })
      }
      setDragState(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [assetsById, dragState, onMoveClip, onTrimClip, zoom])

  const activeClip = resolvedClips.find((clip) => clip.id === activeClipId) ?? null
  const activeTrack = activeClip ? tracks.find((track) => track.id === activeClip.trackId) : null
  const canEditActiveClip = Boolean(activeClip && !activeTrack?.locked)
  const canSplitActiveClip = Boolean(
    activeClip &&
      canEditActiveClip &&
      playhead > activeClip.timelineStart + MIN_CLIP_DURATION &&
      playhead < activeClip.timelineStart + activeClip.duration - MIN_CLIP_DURATION
  )

  const handleClipPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    clip: ResolvedTimelineClip
  ): void => {
    if (event.button !== 0 || !onMoveClip) return
    const track = tracks.find((item) => item.id === clip.trackId)
    if (track?.locked) return
    event.preventDefault()
    onSelectClip(clip.id)
    setDragState({
      pointerId: event.pointerId,
      mode: 'move',
      clip,
      startClientX: event.clientX,
      previewTimelineStart: clip.timelineStart,
      previewSourceStart: clip.sourceStart,
      previewSourceEnd: clip.sourceEnd,
      previewDuration: clip.duration
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
    event.preventDefault()
    event.stopPropagation()
    onSelectClip(clip.id)
    setDragState({
      pointerId: event.pointerId,
      mode,
      clip,
      startClientX: event.clientX,
      previewTimelineStart: clip.timelineStart,
      previewSourceStart: clip.sourceStart,
      previewSourceEnd: clip.sourceEnd,
      previewDuration: clip.duration
    })
  }

  const renderClip = (clip: ResolvedTimelineClip): JSX.Element => {
    const asset = assetsById.get(clip.assetId)
    const isDragging = dragState?.clip.id === clip.id
    const displayStart = isDragging ? dragState.previewTimelineStart : clip.timelineStart
    const displayDuration = isDragging ? dragState.previewDuration : clip.duration
    const style: TimelineCssProperties = {
      '--timeline-width': `${timelineWidth}px`,
      '--clip-left': `${displayStart * zoom}px`,
      '--clip-width': `${Math.max(44, displayDuration * zoom)}px`,
      '--playhead-left': `${playhead * zoom}px`
    }

    return (
      <button
        key={clip.id}
        className="studio-timeline__clip"
        type="button"
        style={style}
        aria-pressed={activeClipId === clip.id}
        aria-label={`${asset?.name ?? '未知素材'} ${formatDuration(displayDuration)}`}
        title={`${asset?.name ?? '未知素材'} · ${formatDuration(displayDuration)}`}
        onClick={() => {
          onSelectClip(clip.id)
          onSetPlayhead?.(clip.timelineStart)
        }}
        onPointerDown={(event) => handleClipPointerDown(event, clip)}
      >
        <span
          className="studio-timeline__trim-handle studio-timeline__trim-handle--left"
          aria-hidden="true"
          onPointerDown={(event) => startTrim(event, clip, 'trim-left')}
        />
        <span className="studio-timeline__clip-name">{asset?.name ?? '未知素材'}</span>
        <time>{formatDuration(displayDuration)}</time>
        <span
          className="studio-timeline__trim-handle studio-timeline__trim-handle--right"
          aria-hidden="true"
          onPointerDown={(event) => startTrim(event, clip, 'trim-right')}
        />
      </button>
    )
  }

  return (
    <section className="studio-timeline" aria-label="时间线">
      <header className="studio-timeline__toolbar">
        <div className="studio-timeline__toolbar-group">
          <button type="button" title="撤销 Ctrl+Z" aria-label="撤销" disabled={!canUndo} onClick={onUndo}>
            <Undo2 size={15} aria-hidden="true" />
          </button>
          <button type="button" title="重做 Ctrl+Shift+Z" aria-label="重做" disabled={!canRedo} onClick={onRedo}>
            <Redo2 size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="studio-timeline__toolbar-group">
          <button
            type="button"
            title="在播放头处分割"
            aria-label="分割片段"
            disabled={!canSplitActiveClip}
            onClick={() => activeClip && onSplitClip?.(activeClip.id, playhead)}
          >
            <Scissors size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="删除片段"
            aria-label="删除片段"
            disabled={!canEditActiveClip}
            onClick={() => activeClip && onDeleteClip?.(activeClip.id)}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="studio-timeline__toolbar-spacer" />
        <span className="studio-timeline__playhead-time">{formatPreciseTime(playhead)}</span>
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

      <div className="studio-timeline__editor">
        <div ref={trackHeadersRef} className="studio-timeline__track-headers">
          <div className="studio-timeline__ruler-corner">轨道</div>
          {tracks.map((track) => (
            <div className="studio-timeline__track-header" key={track.id}>
              <strong>{track.name}</strong>
              <div className="studio-timeline__track-actions">
                <button
                  type="button"
                  title={track.locked ? '解锁轨道' : '锁定轨道'}
                  aria-label={track.locked ? `解锁${track.name}` : `锁定${track.name}`}
                  onClick={() => onUpdateTrack?.(track.id, { locked: !track.locked })}
                >
                  {track.locked ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
                {track.kind !== 'audio' && (
                  <button
                    type="button"
                    title={track.hidden ? '显示轨道' : '隐藏轨道'}
                    aria-label={track.hidden ? `显示${track.name}` : `隐藏${track.name}`}
                    onClick={() => onUpdateTrack?.(track.id, { hidden: !track.hidden })}
                  >
                    {track.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                )}
                <button
                  type="button"
                  title={track.muted ? '取消静音' : '静音轨道'}
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
          className="studio-timeline__scroll-area"
          onScroll={(event) => {
            if (trackHeadersRef.current) {
              trackHeadersRef.current.scrollTop = event.currentTarget.scrollTop
            }
          }}
        >
          <div
            className="studio-timeline__canvas"
            style={timelineCanvasStyle}
            onPointerDown={(event) => {
              if (!onSetPlayhead) return
              const target = event.target as HTMLElement
              if (target.closest('.studio-timeline__clip')) return
              const rect = event.currentTarget.getBoundingClientRect()
              onSetPlayhead(snapTime(Math.max(0, (event.clientX - rect.left) / zoom)))
            }}
          >
            <Ruler duration={timelineDuration} zoom={zoom} />
            <div
              className="studio-timeline__playhead"
              style={{ left: `${Math.min(timelineWidth, playhead * zoom)}px` }}
              aria-hidden="true"
            >
              <span />
            </div>
            {tracks.map((track) => (
              <div
                className="studio-timeline__track-row"
                key={track.id}
                data-locked={track.locked}
                data-hidden={track.hidden}
              >
                {resolvedClips
                  .filter((clip) => clip.trackId === track.id)
                  .map((clip) => renderClip(clip))}
              </div>
            ))}
          </div>
        </div>
      </div>

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

function Ruler({ duration, zoom }: { duration: number; zoom: number }): JSX.Element {
  const step = zoom >= 96 ? 1 : zoom >= 48 ? 2 : 5
  const markers: number[] = []
  for (let second = 0; second <= duration; second += step) markers.push(second)

  return (
    <div className="studio-timeline__ruler" aria-hidden="true">
      {markers.map((second) => (
        <span key={second} style={{ left: `${second * zoom}px` }}>
          {formatRulerTime(second)}
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

function formatPreciseTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const minutes = Math.floor(safe / 60)
  const remaining = safe - minutes * 60
  return `${String(minutes).padStart(2, '0')}:${remaining.toFixed(1).padStart(4, '0')}`
}

function formatRulerTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.floor(seconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
}

function snapTime(value: number): number {
  return Math.round(value * 10) / 10
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export default Timeline
