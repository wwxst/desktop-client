import type { JSX } from 'react'
import { useState } from 'react'
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
        <h2>参数区</h2>
      </header>

      <div className="studio-parameter-panel__content">
        {!clip ? (
          <div className="studio-parameter-panel__empty">选中时间线片段后可调整参数</div>
        ) : (
          <>
            <section className="studio-parameter-panel__section">
              <header>
                <strong>片段</strong>
                <span title={asset?.name}>{asset?.name ?? '未知素材'}</span>
              </header>
              <div className="studio-parameter-panel__grid studio-parameter-panel__grid--2">
                <NumberField
                  label="开始"
                  value={clip.timelineStart}
                  min={0}
                  step={0.1}
                  suffix="s"
                  onCommit={(timelineStart) => onUpdateClip?.({ timelineStart })}
                />
                <NumberField label="时长" value={clip.duration} step={0.1} suffix="s" disabled />
                <NumberField
                  label="入点"
                  value={clip.sourceStart}
                  min={0}
                  step={0.1}
                  suffix="s"
                  onCommit={(sourceStart) => onUpdateClip?.({ sourceStart })}
                />
                <NumberField
                  label="出点"
                  value={clip.sourceEnd}
                  min={0}
                  step={0.1}
                  suffix="s"
                  onCommit={(sourceEnd) => onUpdateClip?.({ sourceEnd })}
                />
              </div>
            </section>

            <section className="studio-parameter-panel__section">
              <header>
                <strong>画面</strong>
              </header>
              <div className="studio-parameter-panel__grid studio-parameter-panel__grid--2">
                <NumberField
                  label="X"
                  value={clip.transform.x}
                  step={1}
                  onCommit={(x) => onUpdateClip?.({ transform: { x } })}
                />
                <NumberField
                  label="Y"
                  value={clip.transform.y}
                  step={1}
                  onCommit={(y) => onUpdateClip?.({ transform: { y } })}
                />
                <NumberField
                  label="缩放 X"
                  value={clip.transform.scaleX * 100}
                  min={1}
                  max={1000}
                  step={1}
                  suffix="%"
                  onCommit={(scaleX) => onUpdateClip?.({ transform: { scaleX: scaleX / 100 } })}
                />
                <NumberField
                  label="缩放 Y"
                  value={clip.transform.scaleY * 100}
                  min={1}
                  max={1000}
                  step={1}
                  suffix="%"
                  onCommit={(scaleY) => onUpdateClip?.({ transform: { scaleY: scaleY / 100 } })}
                />
                <NumberField
                  label="旋转"
                  value={clip.transform.rotation}
                  step={1}
                  suffix="°"
                  onCommit={(rotation) => onUpdateClip?.({ transform: { rotation } })}
                />
                <NumberField
                  label="透明度"
                  value={clip.opacity * 100}
                  min={0}
                  max={100}
                  step={1}
                  suffix="%"
                  onCommit={(opacity) => onUpdateClip?.({ opacity: opacity / 100 })}
                />
              </div>
            </section>

            <section className="studio-parameter-panel__section">
              <header>
                <strong>播放</strong>
              </header>
              <div className="studio-parameter-panel__grid studio-parameter-panel__grid--2">
                <NumberField
                  label="速度"
                  value={clip.speed}
                  min={0.1}
                  max={8}
                  step={0.1}
                  suffix="x"
                  onCommit={(speed) => onUpdateClip?.({ speed })}
                />
                <NumberField
                  label="音量"
                  value={clip.volume * 100}
                  min={0}
                  max={200}
                  step={1}
                  suffix="%"
                  onCommit={(volume) => onUpdateClip?.({ volume: volume / 100 })}
                />
              </div>
              <label className="studio-parameter-panel__toggle">
                <input
                  type="checkbox"
                  checked={clip.muted}
                  onChange={(event) => onUpdateClip?.({ muted: event.currentTarget.checked })}
                />
                <span>片段静音</span>
              </label>
            </section>
          </>
        )}
      </div>
    </section>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
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
  const [draftState, setDraftState] = useState<{ sourceValue: number; text: string }>(() => ({
    sourceValue: value,
    text: String(roundForInput(value))
  }))
  const draft =
    draftState.sourceValue === value ? draftState.text : String(roundForInput(value))
  const updateDraft = (text: string): void => setDraftState({ sourceValue: value, text })

  const commit = (): void => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed)) {
      updateDraft(String(roundForInput(value)))
      return
    }
    const bounded = clampOptional(parsed, min, max)
    updateDraft(String(roundForInput(bounded)))
    onCommit?.(bounded)
  }

  return (
    <label className="studio-parameter-panel__field">
      <span>{label}</span>
      <span className="studio-parameter-panel__input-wrap">
        <input
          type="number"
          aria-label={label}
          value={draft}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => updateDraft(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  )
}

function roundForInput(value: number): number {
  return Math.round(value * 1000) / 1000
}

function clampOptional(value: number, min?: number, max?: number): number {
  let next = value
  if (min !== undefined) next = Math.max(min, next)
  if (max !== undefined) next = Math.min(max, next)
  return next
}

export default ParameterPanel
