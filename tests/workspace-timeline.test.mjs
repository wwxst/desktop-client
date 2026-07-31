import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const timelineSource = await readFile(
  new URL('../src/renderer/src/components/WorkspaceView/Timeline.tsx', import.meta.url),
  'utf8'
).catch(() => '')
const timelineStyles = await readFile(
  new URL('../src/renderer/src/components/WorkspaceView/Timeline.css', import.meta.url),
  'utf8'
).catch(() => '')
const workspaceSource = await readFile(
  new URL('../src/renderer/src/components/WorkspaceView/WorkspaceView.tsx', import.meta.url),
  'utf8'
)

test('renders the draft table headers in the requested order', () => {
  assert.match(
    timelineSource,
    /<section className="studio-timeline" aria-label="[^"]+">[\s\S]*<table className="studio-timeline__table"[\s\S]*<thead>[\s\S]*<tr>/s
  )

  for (const columnName of ['草稿名', '固定开头', '音频', '固定结尾']) {
    assert.match(timelineSource, new RegExp(`<th scope="col">${columnName}</th>`))
  }

  const columnNames = ['草稿名', '固定开头', '音频', '固定结尾']

  for (let index = 1; index < columnNames.length; index += 1) {
    assert.ok(
      timelineSource.indexOf(columnNames[index - 1]) < timelineSource.indexOf(columnNames[index]),
      `${columnNames[index - 1]} should appear before ${columnNames[index]}`
    )
  }

  assert.match(timelineSource, /<form[^>]*className="studio-timeline__table-form"/s)
})

test('renders one editable row beneath the draft table headers', () => {
  assert.match(timelineSource, /<tbody>[\s\S]*<tr[^>]*>[\s\S]*<\/tr>[\s\S]*<\/tbody>/s)
  assert.match(
    timelineSource,
    /<input[^>]*name="draftName"[^>]*type="text"[^>]*aria-label="草稿名"/s
  )
  assert.match(
    timelineSource,
    /<input[^>]*name="fixedStart"[^>]*type="file"[^>]*accept="video\/\*"[^>]*aria-label="上传固定开头"/s
  )
  assert.match(timelineSource, /<select[^>]*name="audio"[^>]*aria-label="音频"/s)
  assert.match(
    timelineSource,
    /<input[^>]*name="fixedEnd"[^>]*type="file"[^>]*accept="video\/\*"[^>]*aria-label="上传固定结尾"/s
  )
  assert.match(timelineSource, /fixedStartFileName/)
  assert.match(timelineSource, /fixedEndFileName/)
  assert.match(timelineSource, /updateRow/)
  assert.doesNotMatch(timelineSource, /name="fixedStart"[^>]*type="checkbox"|name="fixedEnd"[^>]*type="checkbox"/s)
})

test('adds and deletes rows after the fixed-end upload', () => {
  assert.match(timelineSource, /const \[rows, setRows\] = useState/)
  assert.match(timelineSource, /rows\.map\(\(row, index\) =>/)
  assert.match(timelineSource, /handleAddRow/)
  assert.match(timelineSource, /handleDeleteRow/)
  assert.match(
    timelineSource,
    /<td className="studio-timeline__fixed-end-cell">[\s\S]*studio-timeline__upload[\s\S]*studio-timeline__row-actions[\s\S]*<\/td>/s
  )
  assert.doesNotMatch(
    timelineSource,
    /<td className="studio-timeline__draft-cell">[\s\S]*studio-timeline__row-actions[\s\S]*<\/td>/s
  )
  assert.match(timelineSource, /title="新增一行"/)
  assert.match(timelineSource, /title="删除当前行"/)
  assert.match(timelineSource, /disabled=\{rows\.length === 1\}/)
  assert.match(timelineStyles, /\.studio-timeline__fixed-end-cell-content\s*{[^}]*display:\s*grid;/s)
  assert.match(timelineStyles, /\.studio-timeline__row-actions\s*{[^}]*display:\s*flex;/s)
  assert.match(timelineStyles, /\.studio-timeline__row-action\s*{[^}]*width:\s*24px;[^}]*height:\s*24px;/s)
})

test('places the full-width draft table inside the blank timeline area', () => {
  assert.match(
    timelineStyles,
    /\.studio-timeline\s*{[^}]*display:\s*block;[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*min-width:\s*0;[^}]*min-height:\s*0;[^}]*background:\s*#f8f8f8;/s
  )
  assert.match(
    timelineStyles,
    /\.studio-timeline__table-container\s*{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*padding:\s*12px;/s
  )
  assert.match(
    timelineStyles,
    /\.studio-timeline__table\s*{[^}]*width:\s*100%;[^}]*table-layout:\s*fixed;[^}]*border-collapse:\s*collapse;/s
  )
  assert.match(timelineStyles, /\.studio-timeline__table\s+th\s*{/)
  assert.match(timelineStyles, /\.studio-timeline__table\s+td\s*{/)
  assert.match(timelineStyles, /\.studio-timeline__upload\s*{/)
  assert.doesNotMatch(
    timelineStyles,
    /\.studio-timeline__table\s+(?:th|td)\s*\+\s*(?:th|td)\s*{[^}]*border-left:/s
  )
  assert.doesNotMatch(
    timelineStyles,
    /\.studio-timeline__table\s*{[^}]*\bborder(?:-left|-right)?:/s
  )
  assert.doesNotMatch(
    timelineSource,
    /studio-timeline__form|studio-timeline__toolbar|studio-timeline__empty|role="toolbar"/
  )
  assert.match(workspaceSource, /id="workspace-timeline"[^>]*defaultSize="32"[^>]*minSize=\{176\}/s)
})
