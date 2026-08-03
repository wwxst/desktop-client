import type { JSX } from 'react'
import { Plus, Trash2, Upload, Video } from 'lucide-react'
import type { DraftRow, MediaAsset, TimelineClip } from './editorProject'
import './Timeline.css'

interface TimelineProps {
  clips: TimelineClip[]
  assets: MediaAsset[]
  activeClipId: string | null
  rows: DraftRow[]
  onSelectClip: (clipId: string) => void
  onUpdateRow: (rowId: string, updates: Partial<Omit<DraftRow, 'id'>>) => void
  onAddRow: (afterRowId: string) => void
  onDeleteRow: (rowId: string) => void
}

const formatDuration = (duration: number | null): string => {
  if (duration === null || !Number.isFinite(duration)) return '--:--'

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
  rows,
  onSelectClip,
  onUpdateRow,
  onAddRow,
  onDeleteRow
}: TimelineProps): JSX.Element {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]))

  return (
    <section className="studio-timeline" aria-label="时间线">
      <div className="studio-timeline__clip-lane">
        <ol aria-label="时间线素材">
          {clips.map((clip) => {
            const asset = assetsById.get(clip.assetId)
            if (!asset) return null

            return (
              <li key={clip.id}>
                <button
                  className="studio-timeline__clip"
                  type="button"
                  aria-pressed={activeClipId === clip.id}
                  onClick={() => onSelectClip(clip.id)}
                >
                  <Video size={14} strokeWidth={1.7} aria-hidden="true" />
                  <span title={asset.name}>{asset.name}</span>
                  <time>{formatDuration(asset.duration)}</time>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="studio-timeline__table-container">
        <form
          className="studio-timeline__table-form"
          aria-label="草稿设置"
          onSubmit={(event) => event.preventDefault()}
        >
          <table className="studio-timeline__table" aria-label="草稿列表">
            <colgroup>
              <col className="studio-timeline__column studio-timeline__column--draft" />
              <col className="studio-timeline__column studio-timeline__column--fixed-start" />
              <col className="studio-timeline__column studio-timeline__column--audio" />
              <col className="studio-timeline__column studio-timeline__column--fixed-end" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">草稿名</th>
                <th scope="col">固定开头</th>
                <th scope="col">音频</th>
                <th scope="col">固定结尾</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td>
                    <input
                      className="studio-timeline__draft-input"
                      name="draftName"
                      type="text"
                      aria-label="草稿名"
                      placeholder="请输入草稿名"
                      value={row.draftName}
                      onChange={(event) => onUpdateRow(row.id, { draftName: event.target.value })}
                    />
                  </td>
                  <td>
                    <label className="studio-timeline__upload" title={row.fixedStartFileName}>
                      <Upload size={14} strokeWidth={1.75} aria-hidden="true" />
                      <span>{row.fixedStartFileName}</span>
                      <input
                        name="fixedStart"
                        type="file"
                        accept="video/*"
                        aria-label="上传固定开头"
                        onChange={(event) => {
                          onUpdateRow(row.id, {
                            fixedStartFileName: event.currentTarget.files?.[0]?.name ?? '选择视频'
                          })
                        }}
                      />
                    </label>
                  </td>
                  <td>
                    <select
                      className="studio-timeline__audio-select"
                      name="audio"
                      aria-label="音频"
                      value={row.audio}
                      onChange={(event) => onUpdateRow(row.id, { audio: event.target.value })}
                    >
                      <option value="" disabled>
                        请选择音频
                      </option>
                      <option value="none">无音频</option>
                    </select>
                  </td>
                  <td className="studio-timeline__fixed-end-cell">
                    <div className="studio-timeline__fixed-end-cell-content">
                      <label className="studio-timeline__upload" title={row.fixedEndFileName}>
                        <Upload size={14} strokeWidth={1.75} aria-hidden="true" />
                        <span>{row.fixedEndFileName}</span>
                        <input
                          name="fixedEnd"
                          type="file"
                          accept="video/*"
                          aria-label="上传固定结尾"
                          onChange={(event) => {
                            onUpdateRow(row.id, {
                              fixedEndFileName: event.currentTarget.files?.[0]?.name ?? '选择视频'
                            })
                          }}
                        />
                      </label>

                      <div
                        className="studio-timeline__row-actions"
                        aria-label={`第 ${index + 1} 行操作`}
                      >
                        <button
                          className="studio-timeline__row-action studio-timeline__row-action--add"
                          type="button"
                          title="新增一行"
                          aria-label={`在第 ${index + 1} 行后新增`}
                          onClick={() => onAddRow(row.id)}
                        >
                          <Plus size={14} strokeWidth={1.8} aria-hidden="true" />
                        </button>
                        <button
                          className="studio-timeline__row-action studio-timeline__row-action--delete"
                          type="button"
                          title="删除当前行"
                          aria-label={`删除第 ${index + 1} 行`}
                          disabled={rows.length === 1}
                          onClick={() => onDeleteRow(row.id)}
                        >
                          <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </form>
      </div>
    </section>
  )
}

export default Timeline
