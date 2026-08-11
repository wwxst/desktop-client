import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const playerPanelCss = readFileSync(
  resolve(
    process.cwd(),
    'src/renderer/src/components/SmartEdit/VideoEditorWorkspace/PlayerPanel.css'
  ),
  'utf8'
)

function getCssBlock(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = playerPanelCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1]
  if (!block) throw new Error(`Missing CSS block for ${selector}`)
  return block
}

describe('PlayerPanel canvas layout', () => {
  it('uses the largest available stage bounds for every canvas aspect ratio', () => {
    const stage = getCssBlock('.studio-player__stage')
    const canvas = getCssBlock('.studio-player__canvas')

    expect(stage).toContain('padding: 0;')
    expect(canvas).toContain('width: min(100cqw, calc(100cqh * var(--canvas-ratio-value)));')
    expect(canvas).toContain('max-width: 100%;')
    expect(canvas).toContain('max-height: 100%;')
    expect(canvas).toContain('aspect-ratio: var(--canvas-aspect-ratio);')
    expect(canvas).not.toContain('88cqw')
    expect(canvas).not.toContain('88cqh')
  })
})
