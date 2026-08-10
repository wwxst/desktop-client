import type { JSX, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { ChevronDown, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ClipPatch } from './editorCommands'
import type { MediaAsset, ResolvedTimelineClip } from './editorProject'
import './ParameterPanel.css'

interface ParameterPanelProps {
  clip?: ResolvedTimelineClip | null
  asset?: MediaAsset | null
  onUpdateClip?: (patch: ClipPatch) => void
}

function ParameterPanel({ clip = null, asset = null, onUpdateClip }: ParameterPanelProps): JSX.Element {
  return (
    <section className="studio-parameter-panel" aria-label="参数区">
      <header className="studio-workspace__panel-header">
        <h2>{clip ? '视频' : '属性'}</h2>
        {clip && <span title={asset?.name}>{asset?.name ?? '未知素材'}</span>}
      </header>
      <div className="studio-parameter-panel__content">
        {!clip ? (
          <div className="studio-parameter-panel__empty">
            <strong>选择一个画面片段</strong>
            <span>可在这里精确调整位置、缩放、旋转、透明度与声音</span>
          </div>
        ) : (
          <>
            <InspectorSection title="时间" defaultOpen>
              <div className="studio-parameter-panel__grid studio-parameter-panel__grid--2">
                <ScrubNumber label="开始" value={clip.timelineStart} min={0} step={0.05} suffix="s" onCommit={(timelineStart) => onUpdateClip?.({ timelineStart })} />
                <ScrubNumber label="时长" value={clip.duration} step={0.05} suffix="s" disabled />
                <ScrubNumber label="入点" value={clip.sourceStart} min={0} step={0.05} suffix="s" onCommit={(sourceStart) => onUpdateClip?.({ sourceStart })} />
                <ScrubNumber label="出点" value={clip.sourceEnd} min={0} step={0.05} suffix="s" onCommit={(sourceEnd) => onUpdateClip?.({ sourceEnd })} />
              </div>
            </InspectorSection>

            <InspectorSection
              title="变换"
              defaultOpen
              action={
                <button
                  type="button"
                  className="studio-parameter-panel__icon-button"
                  title="重置变换"
                  aria-label="重置变换"
                  onClick={() => onUpdateClip?.({ transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 } })}
                >
                  <RotateCcw size={13} />
                </button>
              }
            >
              <div className="studio-parameter-panel__grid studio-parameter-panel__grid--2">
                <ScrubNumber label="位置 X" value={clip.transform.x} step={1} onCommit={(x) => onUpdateClip?.({ transform: { x } })} />
                <ScrubNumber label="位置 Y" value={clip.transform.y} step={1} onCommit={(y) => onUpdateClip?.({ transform: { y } })} />
                <ScrubNumber label="缩放" value={clip.transform.scaleX * 100} min={5} max={1000} step={1} suffix="%" onCommit={(scale) => onUpdateClip?.({ transform: { scaleX: scale / 100, scaleY: scale / 100 } })} />
                <ScrubNumber label="旋转" value={clip.transform.rotation} step={1} suffix="°" onCommit={(rotation) => onUpdateClip?.({ transform: { rotation } })} />
              </div>
            </InspectorSection>

            <InspectorSection title="混合" defaultOpen>
              <InspectorSlider
                label="透明度"
                value={clip.opacity * 100}
                min={0}
                max={100}
                suffix="%"
                onCommit={(opacity) => onUpdateClip?.({ opacity: opacity / 100 })}
              />
            </InspectorSection>

            <InspectorSection title="播放" defaultOpen>
              <InspectorSlider
                label="速度"
                value={clip.speed}
                min={0.1}
                max={8}
                step={0.1}
                suffix="x"
                onCommit={(speed) => onUpdateClip?.({ speed })}
              />
              <InspectorSlider
                label="音量"
                value={clip.volume * 100}
                min={0}
                max={100}
                suffix="%"
                onCommit={(volume) => onUpdateClip?.({ volume: volume / 100 })}
              />
              <label className="studio-parameter-panel__toggle">
                <input type="checkbox" checked={clip.muted} onChange={(event) => onUpdateClip?.({ muted: event.currentTarget.checked })} />
                <span>片段静音</span>
              </label>
              <label className="studio-parameter-panel__toggle">
                <input type="checkbox" checked={clip.enabled} onChange={(event) => onUpdateClip?.({ enabled: event.currentTarget.checked })} />
                <span>启用片段</span>
              </label>
            </InspectorSection>
          </>
        )}
      </div>
    </section>
  )
}

function InspectorSection({
  title,
  defaultOpen = false,
  action,
  children
}: {
  title: string
  defaultOpen?: boolean
  action?: JSX.Element
  children: ReactNode
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="studio-parameter-panel__section" data-open={open ? 'true' : undefined}>
      <header>
        <button type="button" className="studio-parameter-panel__section-toggle" onClick={() => setOpen((value) => !value)}>
          <ChevronDown size={13} aria-hidden="true" />
          <strong>{title}</strong>
        </button>
        {action}
      </header>
      {open && <div className="studio-parameter-panel__section-body">{children}</div>}
    </section>
  )
}

function ScrubNumber({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  disabled = false,
  onCommit
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  suffix?: string
  disabled?: boolean
  onCommit?: (value: number) => void
}): JSX.Element {
  const [draft, setDraft] = useState(roundForInput(value))
  useEffect(() => setDraft(roundForInput(value)), [value])

  const commit = (next = draft): void => {
    const bounded = clampOptional(next, min, max)
    setDraft(roundForInput(bounded))
    onCommit?.(bounded)
  }

  const startScrub = (event: ReactPointerEvent<HTMLSpanElement>): void => {
    if (disabled || event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startValue = draft
    let latest = draft
    const move = (moveEvent: PointerEvent): void => {
      latest = clampOptional(startValue + (moveEvent.clientX - startX) * step, min, max)
      setDraft(roundForInput(latest))
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      commit(latest)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <label className="studio-parameter-panel__field" data-disabled={disabled ? 'true' : undefined}>
      <span className="studio-parameter-panel__field-label" onPointerDown={startScrub}>{label}</span>
      <span className="studio-parameter-panel__input-wrap">
        <input
          type="number"
          aria-label={label}
          value={draft}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => setDraft(Number(event.currentTarget.value))}
          onBlur={() => commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  )
}

function InspectorSlider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onCommit
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onCommit: (value: number) => void
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <label className="studio-parameter-panel__slider-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={draft} onChange={(event) => setDraft(Number(event.currentTarget.value))} onPointerUp={() => onCommit(draft)} onKeyUp={() => onCommit(draft)} />
      <output>{roundForInput(draft)}{suffix}</output>
    </label>
  )
}

function roundForInput(value: number): number {
  return Math.round(value * 1000) / 1000
}

function clampOptional(value: number, min?: number, max?: number): number {
  let next = Number.isFinite(value) ? value : 0
  if (min !== undefined) next = Math.max(min, next)
  if (max !== undefined) next = Math.min(max, next)
  return next
}

export default ParameterPanel
