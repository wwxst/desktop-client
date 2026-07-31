import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sidebarSource = await readFile(
  new URL('../src/renderer/src/components/Sidebar/Sidebar.tsx', import.meta.url),
  'utf8'
)
const sidebarStyles = await readFile(
  new URL('../src/renderer/src/components/Sidebar/Sidebar.css', import.meta.url),
  'utf8'
)

test('renders the approved avatar and two-line account identity', () => {
  assert.doesNotMatch(sidebarSource, /UserRound/)
  assert.match(sidebarSource, /className="studio-sidebar__avatar"[^>]*>\s*KA\s*</)
  assert.match(sidebarSource, /className="studio-sidebar__identity"/)
  assert.match(sidebarSource, /className="studio-sidebar__nickname">kasixmb</)
  assert.match(sidebarSource, /className="studio-sidebar__plan">Plus</)
})

test('uses the approved compact dimensions and red avatar treatment', () => {
  const avatarMatch = sidebarStyles.match(/\.studio-sidebar__avatar\s*\{([^}]*)\}/)
  const identityMatch = sidebarStyles.match(/\.studio-sidebar__identity\s*\{([^}]*)\}/)

  assert.ok(avatarMatch, 'Expected CSS rule for .studio-sidebar__avatar')
  assert.ok(identityMatch, 'Expected CSS rule for .studio-sidebar__identity')

  const avatarRule = avatarMatch[1]
  const identityRule = identityMatch[1]

  assert.match(avatarRule, /flex:\s*0 0 24px/)
  assert.match(avatarRule, /width:\s*24px/)
  assert.match(avatarRule, /height:\s*24px/)
  assert.match(avatarRule, /background:\s*#ef493f/)
  assert.match(identityRule, /flex-direction:\s*column/)
})
