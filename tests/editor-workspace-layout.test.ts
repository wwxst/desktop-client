import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspaceCss = readFileSync(
  resolve(
    process.cwd(),
    'src/renderer/src/components/SmartEdit/VideoEditorWorkspace/VideoEditorWorkspace.css'
  ),
  'utf8'
)
const timelineCss = readFileSync(
  resolve(process.cwd(), 'src/renderer/src/components/SmartEdit/VideoEditorWorkspace/Timeline.css'),
  'utf8'
)

describe('VideoEditorWorkspace card separators', () => {
  it('does not draw vertical or horizontal lines between cards', () => {
    expect(workspaceCss).not.toMatch(/\.studio-workspace__column-resize-handle::after\s*\{/)
    expect(workspaceCss).not.toMatch(/\.studio-workspace__row-resize-handle::after\s*\{/)
  })

  it('keeps keyboard focus visible on both resize handles', () => {
    const focusBlock = workspaceCss.match(
      /\.studio-workspace__column-resize-handle:focus-visible,\s*\.studio-workspace__row-resize-handle:focus-visible\s*\{([^}]*)\}/
    )?.[1]

    expect(focusBlock).toContain('outline: 2px solid var(--editor-accent);')
    expect(focusBlock).toContain('outline-offset: -2px;')
  })

  it('uses one 6px value for card spacing in every direction', () => {
    expect(workspaceCss).toMatch(/--workspace-card-gap:\s*6px;/)
    expect(workspaceCss).toMatch(
      /\.studio-workspace__top\s*\{[\s\S]*?padding:\s*var\(--workspace-card-gap\)\s+var\(--workspace-card-gap\)\s+0;/
    )
    expect(workspaceCss).toMatch(
      /\.studio-workspace__timeline\s*\{[\s\S]*?margin:\s*0\s+var\(--workspace-card-gap\)\s+var\(--workspace-card-gap\);/
    )
    expect(workspaceCss).toMatch(
      /\.studio-workspace__timeline\s*\{[\s\S]*?height:\s*calc\(100%\s+-\s+var\(--workspace-card-gap\)\);/
    )
    expect(workspaceCss).toMatch(
      /\.studio-workspace__column-resize-handle\s*\{[\s\S]*?width:\s*var\(--workspace-card-gap\);/
    )
    expect(workspaceCss).toMatch(
      /\.studio-workspace__row-resize-handle\s*\{[\s\S]*?height:\s*var\(--workspace-card-gap\);/
    )
  })

  it('keeps the timeline card margins inside the workspace width', () => {
    expect(workspaceCss).toMatch(/\.studio-workspace__timeline\s*\{[\s\S]*?width:\s*auto;/)
  })

  it('keeps vertical timeline scrolling without showing a horizontal scrollbar', () => {
    expect(timelineCss).toMatch(/\.studio-timeline__scroll-area\s*\{[\s\S]*?overflow-x:\s*hidden;/)
    expect(timelineCss).toMatch(/\.studio-timeline__scroll-area\s*\{[\s\S]*?overflow-y:\s*auto;/)
  })
})
