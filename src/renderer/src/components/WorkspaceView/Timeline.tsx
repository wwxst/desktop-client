import type { JSX } from 'react'
import { useRef, useState } from 'react'
import { Plus, Trash2, Upload } from 'lucide-react'
import './Timeline.css'

interface DraftRow {
  id: number
  draftName: string
  fixedStartFileName: string
  audio: string
  fixedEndFileName: string
}

const createDraftRow = (id: number): DraftRow => ({
  id,
  draftName: '',
  fixedStartFileName: '选择视频',
  audio: '',
  fixedEndFileName: '选择视频'
})

function Timeline(): JSX.Element {
  const [rows, setRows] = useState<DraftRow[]>([createDraftRow(1)])
  const nextRowIdRef = useRef(2)

  const updateRow = (rowId: number, updates: Partial<Omit<DraftRow, 'id'>>): void => {
    setRows((currentRows) =>
      currentRows.map((row) => (row.id === rowId ? { ...row, ...updates } : row))
    )
  }

  const handleAddRow = (index: number): void => {
    const newRow = createDraftRow(nextRowIdRef.current)
    nextRowIdRef.current += 1

    setRows((currentRows) => [
      ...currentRows.slice(0, index + 1),
      newRow,
      ...currentRows.slice(index + 1)
    ])
  }

  const handleDeleteRow = (rowId: number): void => {
    setRows((currentRows) => {
      if (currentRows.length === 1) return currentRows

      return currentRows.filter((row) => row.id !== rowId)
    })
  }

  return (
    <section className="studio-timeline" aria-label="时间线">
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
                      onChange={(event) => updateRow(row.id, { draftName: event.target.value })}
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
                          updateRow(row.id, {
                            fixedStartFileName:
                              event.currentTarget.files?.[0]?.name ?? '选择视频'
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
                      onChange={(event) => updateRow(row.id, { audio: event.target.value })}
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
                            updateRow(row.id, {
                              fixedEndFileName:
                                event.currentTarget.files?.[0]?.name ?? '选择视频'
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
                          onClick={() => handleAddRow(index)}
                        >
                          <Plus size={14} strokeWidth={1.8} aria-hidden="true" />
                        </button>
                        <button
                          className="studio-timeline__row-action studio-timeline__row-action--delete"
                          type="button"
                          title="删除当前行"
                          aria-label={`删除第 ${index + 1} 行`}
                          disabled={rows.length === 1}
                          onClick={() => handleDeleteRow(row.id)}
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
