import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspaceSource = readFileSync(
  resolve(
    process.cwd(),
    'src/renderer/src/components/SmartEdit/VideoEditorWorkspace/VideoEditorWorkspace.tsx'
  ),
  'utf8'
)

function getPanelBlock(panelId: string): string {
  const escapedId = panelId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = workspaceSource.match(
    new RegExp(`<Panel\\s+id="${escapedId}"([\\s\\S]*?)>\\s*[\\s\\S]*?\\n\\s*</Panel>`)
  )?.[1]
  if (!block) throw new Error(`Missing panel block for ${panelId}`)
  return block
}

describe('VideoEditorWorkspace preview columns', () => {
  it('opens both side cards at their maximum widths while preserving a 9:16 center minimum', () => {
    const functionPanel = getPanelBlock('function-panel')
    const playerPanel = getPanelBlock('player-panel')
    const parameterPanel = getPanelBlock('parameter-panel')

    expect(functionPanel).toContain('defaultSize={360}')
    expect(functionPanel).toContain('maxSize={360}')
    expect(parameterPanel).toContain('defaultSize={420}')
    expect(parameterPanel).toContain('maxSize={420}')
    expect(playerPanel).toContain('minSize={240}')
  })

  it('uses a fresh persisted layout key for the expanded defaults', () => {
    expect(workspaceSource).toContain("groupId: 'desktop-client-editor-v2-columns-expanded'")
    expect(workspaceSource).not.toContain("groupId: 'desktop-client-editor-v2-columns'")
  })
})
