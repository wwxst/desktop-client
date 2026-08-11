import type { CSSProperties, JSX, PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import EditorContextMenu, { type EditorContextMenuItem } from './EditorContextMenu'
import type { ClipPatch } from './editorCommands'
import type {
  ClipTransform,
  EditorProjectState,
  MediaAsset,
  ResolvedTimelineClip,
  TimelineComposition
} from './editorProject'
import {
  getContainedMediaRect,
  getFillTransform,
  getFitTransform,
  getProjectCanvasSize,
  projectToViewport,
  screenDeltaToProjectDelta,
  snapClipCenterToCanvas,
  type Size2D
} from './core/editorCoordinate'
import type { EditorInteractionController } from './interaction/editorInteractionController'
import './CompositionPreview.css'

interface CompositionPreviewProps {
  project: EditorProjectState
  composition: TimelineComposition
  playhead: number
  isPlaying: boolean
  interactionController?: EditorInteractionController
  onMediaError: (assetId: string) => void
  activeClipId?: string | null
  onSelectClip?: (clipId: string) => void
  onUpdateClip?: (patch: ClipPatch) => void
  onUpdateClipById?: (clipId: string, patch: ClipPatch) => void
  onDeleteClip?: (clipId: string) => void
  onCutClip?: (clipId: string) => void
  onCopyClip?: (clipId: string) => void
  onDuplicateClip?: (clipId: string) => void
  onToggleClipMuted?: (clipId: string) => void
  onToggleClipEnabled?: (clipId: string) => void
  onResetClipTransform?: (clipId: string) => void
}

interface LayerStyle extends CSSProperties {
  zIndex: number
}

type CanvasInteraction =
  | {
      mode: 'move'
      pointerId: number
      clipId: string
      startX: number
      startY: number
      initial: ClipTransform
    }
  | {
      mode: 'scale'
      pointerId: number
      clipId: string
      startX: number
      startY: number
      initial: ClipTransform
    }
  | {
      mode: 'rotate'
      pointerId: number
      clipId: string
      initialAngle: number
      initial: ClipTransform
    }

interface PreviewTransformState {
  clipId: string
  transform: ClipTransform
  guideX: number | null
  guideY: number | null
}

const CANVAS_SNAP_SCREEN_PX = 7

function CompositionPreview({
  project,
  composition,
  playhead,
  isPlaying,
  interactionController,
  onMediaError,
  activeClipId = null,
  onSelectClip,
  onUpdateClip,
  onUpdateClipById,
  onDeleteClip,
  onCutClip,
  onCopyClip,
  onDuplicateClip,
  onToggleClipMuted,
  onToggleClipEnabled,
  onResetClipTransform
}: CompositionPreviewProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const mediaRefs = useRef<Map<string, HTMLMediaElement>>(new Map())
  const [viewportSize, setViewportSize] = useState<Size2D>({ width: 1, height: 1 })
  const [interaction, setInteraction] = useState<CanvasInteraction | null>(null)
  const [preview, setPreview] = useState<PreviewTransformState | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clip: ResolvedTimelineClip } | null>(null)

  const projectCanvas = useMemo(() => getProjectCanvasSize(project.aspectRatio), [project.aspectRatio])
  const assetsById = useMemo(
    () => new Map(project.assets.map((asset) => [asset.id, asset])),
    [project.assets]
  )
  const tracksById = useMemo(
    () => new Map(project.tracks.map((track) => [track.id, track])),
    [project.tracks]
  )
  const visibleClips = useMemo(
    () => [...composition.videoLayers, ...composition.audioLayers],
    [composition.audioLayers, composition.videoLayers]
  )
  const activeVisualClip = composition.videoLayers.find((clip) => clip.id === activeClipId) ?? null
  const activeAsset = activeVisualClip ? assetsById.get(activeVisualClip.assetId) ?? null : null

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const update = (): void => {
      const rect = root.getBoundingClientRect()
      setViewportSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const visibleIds = new Set(visibleClips.map((clip) => clip.id))
    for (const id of mediaRefs.current.keys()) {
      if (!visibleIds.has(id)) mediaRefs.current.delete(id)
    }

    for (const clip of visibleClips) {
      const media = mediaRefs.current.get(clip.id)
      if (!media) continue
      const trackMuted = tracksById.get(clip.trackId)?.muted === true
      const muted = clip.muted || trackMuted
      media.muted = muted
      media.volume = muted ? 0 : clamp(clip.volume, 0, 1)
      media.playbackRate = clip.speed
      const sourceTime = getSourceTime(clip, playhead)
      if (Math.abs(media.currentTime - sourceTime) > 0.04) media.currentTime = sourceTime
    }
  }, [playhead, tracksById, visibleClips])

  useEffect(() => {
    for (const media of mediaRefs.current.values()) {
      if (isPlaying) {
        try {
          const result = media.play()
          if (result) void result.catch(() => undefined)
        } catch {
          // 自动播放限制会在下一次用户显式播放时重试。
        }
      } else {
        media.pause()
      }
    }
  }, [isPlaying, visibleClips])

  useEffect(() => {
    if (!interaction) return

    const handleMove = (event: PointerEvent): void => {
      if (event.pointerId !== interaction.pointerId) return
      const root = rootRef.current
      if (!root) return

      if (interaction.mode === 'move') {
        const projectDelta = screenDeltaToProjectDelta(
          { x: event.clientX - interaction.startX, y: event.clientY - interaction.startY },
          projectCanvas,
          viewportSize
        )
        const desired = {
          x: interaction.initial.x + projectDelta.x,
          y: interaction.initial.y + projectDelta.y
        }
        const clip = composition.videoLayers.find((candidate) => candidate.id === interaction.clipId)
        const asset = clip ? assetsById.get(clip.assetId) ?? null : null
        if (!clip) return
        const screenToProject = Math.max(
          projectCanvas.width / viewportSize.width,
          projectCanvas.height / viewportSize.height
        )
        const snapped = event.shiftKey
          ? { point: desired, guides: { x: null, y: null } }
          : snapClipCenterToCanvas(
              desired,
              { ...clip, transform: interaction.initial },
              asset,
              projectCanvas,
              CANVAS_SNAP_SCREEN_PX * screenToProject
            )
        setPreview({
          clipId: interaction.clipId,
          transform: { ...interaction.initial, x: snapped.point.x, y: snapped.point.y },
          guideX: snapped.guides.x,
          guideY: snapped.guides.y
        })
        return
      }

      if (interaction.mode === 'scale') {
        const baseRect = activeAsset ? getContainedMediaRect(activeAsset, projectCanvas) : null
        const baseScreenWidth = baseRect
          ? Math.max(80, (baseRect.width / projectCanvas.width) * viewportSize.width)
          : Math.max(80, viewportSize.width)
        const delta = (event.clientX - interaction.startX + event.clientY - interaction.startY) / (baseScreenWidth * 1.5)
        const scale = clamp(interaction.initial.scaleX + delta, 0.05, 10)
        setPreview({
          clipId: interaction.clipId,
          transform: { ...interaction.initial, scaleX: scale, scaleY: scale },
          guideX: null,
          guideY: null
        })
        return
      }

      const translated = projectToViewport(
        { x: interaction.initial.x, y: interaction.initial.y },
        projectCanvas,
        viewportSize
      )
      const rect = root.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2 + translated.x
      const centerY = rect.top + rect.height / 2 + translated.y
      const angle = (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI
      const deltaAngle = angle - interaction.initialAngle
      const rotation = event.shiftKey
        ? Math.round((interaction.initial.rotation + deltaAngle) / 15) * 15
        : interaction.initial.rotation + deltaAngle
      setPreview({
        clipId: interaction.clipId,
        transform: { ...interaction.initial, rotation },
        guideX: null,
        guideY: null
      })
    }

    const finish = (event: PointerEvent): void => {
      if (event.pointerId !== interaction.pointerId) return
      const next = preview?.clipId === interaction.clipId ? preview.transform : interaction.initial
      if (onUpdateClipById) onUpdateClipById(interaction.clipId, { transform: next })
      else onUpdateClip?.({ transform: next })
      interactionController?.end()
      setInteraction(null)
      setPreview(null)
    }

    const cancel = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      interactionController?.cancel()
      setInteraction(null)
      setPreview(null)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('keydown', cancel)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('keydown', cancel)
    }
  }, [
    activeAsset,
    assetsById,
    composition.videoLayers,
    interaction,
    interactionController,
    onUpdateClip,
    onUpdateClipById,
    preview,
    projectCanvas,
    viewportSize
  ])

  const beginMove = (event: ReactPointerEvent<HTMLElement>, clip: ResolvedTimelineClip): void => {
    if (event.button !== 0) return
    if (interactionController && !interactionController.begin('moving-canvas-item', event.pointerId)) return
    event.preventDefault()
    event.stopPropagation()
    onSelectClip?.(clip.id)
    setPreview(null)
    setInteraction({
      mode: 'move',
      pointerId: event.pointerId,
      clipId: clip.id,
      startX: event.clientX,
      startY: event.clientY,
      initial: { ...clip.transform }
    })
  }

  const beginScale = (event: ReactPointerEvent<HTMLButtonElement>, clip: ResolvedTimelineClip): void => {
    if (event.button !== 0) return
    if (interactionController && !interactionController.begin('scaling-canvas-item', event.pointerId)) return
    event.preventDefault()
    event.stopPropagation()
    setInteraction({
      mode: 'scale',
      pointerId: event.pointerId,
      clipId: clip.id,
      startX: event.clientX,
      startY: event.clientY,
      initial: { ...clip.transform }
    })
  }

  const beginRotate = (event: ReactPointerEvent<HTMLButtonElement>, clip: ResolvedTimelineClip): void => {
    if (event.button !== 0) return
    const root = rootRef.current
    if (!root) return
    if (interactionController && !interactionController.begin('rotating-canvas-item', event.pointerId)) return
    event.preventDefault()
    event.stopPropagation()
    const rect = root.getBoundingClientRect()
    const translated = projectToViewport(clip.transform, projectCanvas, viewportSize)
    const centerX = rect.left + rect.width / 2 + translated.x
    const centerY = rect.top + rect.height / 2 + translated.y
    const angle = (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI
    setInteraction({
      mode: 'rotate',
      pointerId: event.pointerId,
      clipId: clip.id,
      initialAngle: angle,
      initial: { ...clip.transform }
    })
  }

  const applyFit = (clip: ResolvedTimelineClip): void => {
    if (onUpdateClipById) onUpdateClipById(clip.id, { transform: getFitTransform() })
    else onUpdateClip?.({ transform: getFitTransform() })
  }
  const applyFill = (clip: ResolvedTimelineClip): void => {
    const asset = assetsById.get(clip.assetId) ?? null
    if (onUpdateClipById) onUpdateClipById(clip.id, { transform: getFillTransform(asset, projectCanvas) })
    else onUpdateClip?.({ transform: getFillTransform(asset, projectCanvas) })
  }

  const contextMenuItems: EditorContextMenuItem[] = contextMenu
    ? [
        { id: 'cut', label: '剪切', shortcut: 'Ctrl+X', onSelect: () => onCutClip?.(contextMenu.clip.id) },
        { id: 'copy', label: '复制', shortcut: 'Ctrl+C', onSelect: () => onCopyClip?.(contextMenu.clip.id) },
        { id: 'duplicate', label: '复制片段', shortcut: 'Ctrl+D', onSelect: () => onDuplicateClip?.(contextMenu.clip.id) },
        { id: 'separator-edit', separator: true },
        { id: 'mute', label: contextMenu.clip.muted ? '取消静音' : '静音', onSelect: () => onToggleClipMuted?.(contextMenu.clip.id) },
        { id: 'enabled', label: contextMenu.clip.enabled ? '禁用片段' : '启用片段', onSelect: () => onToggleClipEnabled?.(contextMenu.clip.id) },
        { id: 'separator-state', separator: true },
        { id: 'fit', label: '适应画布', onSelect: () => applyFit(contextMenu.clip) },
        { id: 'fill', label: '填充画布', onSelect: () => applyFill(contextMenu.clip) },
        { id: 'reset-transform', label: '重置变换', onSelect: () => onResetClipTransform?.(contextMenu.clip.id) },
        { id: 'separator-delete', separator: true },
        { id: 'delete', label: '删除', shortcut: 'Delete', danger: true, onSelect: () => onDeleteClip?.(contextMenu.clip.id) }
      ]
    : []

  return (
    <div ref={rootRef} className="studio-composition-preview" aria-label="工程合成预览">
      {composition.videoLayers.map((clip, index) => {
        const asset = assetsById.get(clip.assetId)
        if (!asset || asset.status !== 'ready') return null
        const transform = preview?.clipId === clip.id ? preview.transform : clip.transform
        return (
          <video
            key={clip.id}
            className="studio-composition-preview__media"
            data-active={clip.id === activeClipId ? 'true' : undefined}
            ref={(media) => {
              if (media) mediaRefs.current.set(clip.id, media)
              else mediaRefs.current.delete(clip.id)
            }}
            src={asset.url}
            preload="auto"
            playsInline
            muted={clip.muted || tracksById.get(clip.trackId)?.muted === true}
            onLoadedData={(event) => {
              event.currentTarget.currentTime = getSourceTime(clip, playhead)
            }}
            onError={() => onMediaError(asset.id)}
            onPointerDown={(event) => beginMove(event, clip)}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onSelectClip?.(clip.id)
              setContextMenu({ x: event.clientX, y: event.clientY, clip })
            }}
            style={getLayerStyle(clip, index + 1, transform, projectCanvas, viewportSize)}
            aria-label={`${asset.name}合成预览`}
          />
        )
      })}

      {composition.audioLayers.map((clip) => {
        const asset = assetsById.get(clip.assetId)
        if (!asset || asset.status !== 'ready') return null
        return (
          <audio
            key={clip.id}
            className="studio-composition-preview__audio"
            ref={(media) => {
              if (media) mediaRefs.current.set(clip.id, media)
              else mediaRefs.current.delete(clip.id)
            }}
            src={asset.url}
            preload="auto"
            muted={clip.muted || tracksById.get(clip.trackId)?.muted === true}
            onLoadedData={(event) => {
              event.currentTarget.currentTime = getSourceTime(clip, playhead)
            }}
            onError={() => onMediaError(asset.id)}
            aria-label={`${asset.name}合成音频`}
          />
        )
      })}

      {activeVisualClip && (
        <div
          className="studio-composition-preview__transform-box"
          style={getTransformBoxStyle(
            preview?.clipId === activeVisualClip.id ? preview.transform : activeVisualClip.transform,
            activeAsset,
            projectCanvas,
            viewportSize
          )}
          aria-label="画面变换控制"
        >
          <button type="button" className="studio-composition-preview__handle studio-composition-preview__handle--nw" aria-label="缩放画面" onPointerDown={(event) => beginScale(event, activeVisualClip)} />
          <button type="button" className="studio-composition-preview__handle studio-composition-preview__handle--ne" aria-label="缩放画面" onPointerDown={(event) => beginScale(event, activeVisualClip)} />
          <button type="button" className="studio-composition-preview__handle studio-composition-preview__handle--sw" aria-label="缩放画面" onPointerDown={(event) => beginScale(event, activeVisualClip)} />
          <button type="button" className="studio-composition-preview__handle studio-composition-preview__handle--se" aria-label="缩放画面" onPointerDown={(event) => beginScale(event, activeVisualClip)} />
          <button
            type="button"
            className="studio-composition-preview__rotate-handle"
            aria-label="旋转画面"
            title="拖动旋转；按住 Shift 以 15° 吸附"
            onPointerDown={(event) => beginRotate(event, activeVisualClip)}
          />
        </div>
      )}

      {preview?.guideX !== null && preview?.guideX !== undefined && (
        <div
          className="studio-composition-preview__guide studio-composition-preview__guide--x"
          style={{ left: `${50 + (preview.guideX / projectCanvas.width) * 100}%` }}
        />
      )}
      {preview?.guideY !== null && preview?.guideY !== undefined && (
        <div
          className="studio-composition-preview__guide studio-composition-preview__guide--y"
          style={{ top: `${50 + (preview.guideY / projectCanvas.height) * 100}%` }}
        />
      )}
      {contextMenu && (
        <EditorContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems} onClose={() => setContextMenu(null)} />
      )}
    </div>
  )
}

function getSourceTime(clip: ResolvedTimelineClip, playhead: number): number {
  return clamp(
    clip.sourceStart + (playhead - clip.timelineStart) * clip.speed,
    clip.sourceStart,
    clip.sourceEnd
  )
}

function getLayerStyle(
  clip: ResolvedTimelineClip,
  zIndex: number,
  transform: ClipTransform,
  projectCanvas: Size2D,
  viewport: Size2D
): LayerStyle {
  return {
    zIndex,
    opacity: clip.opacity,
    transform: toCssTransform(transform, projectCanvas, viewport)
  }
}

function getTransformBoxStyle(
  transform: ClipTransform,
  asset: MediaAsset | null,
  projectCanvas: Size2D,
  viewport: Size2D
): CSSProperties {
  const contained = getContainedMediaRect(asset, projectCanvas)
  const width = (contained.width / projectCanvas.width) * viewport.width
  const height = (contained.height / projectCanvas.height) * viewport.height
  const translation = projectToViewport(transform, projectCanvas, viewport)
  return {
    width,
    height,
    left: '50%',
    top: '50%',
    transform: `translate(-50%, -50%) translate(${translation.x}px, ${translation.y}px) scale(${transform.scaleX}, ${transform.scaleY}) rotate(${transform.rotation}deg)`
  }
}

function toCssTransform(transform: ClipTransform, projectCanvas: Size2D, viewport: Size2D): string {
  const translation = projectToViewport(transform, projectCanvas, viewport)
  return `translate(${translation.x}px, ${translation.y}px) scale(${transform.scaleX}, ${transform.scaleY}) rotate(${transform.rotation}deg)`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export default CompositionPreview
