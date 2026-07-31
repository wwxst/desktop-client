# Sidebar User Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic sidebar account row with the approved compact avatar, two-line identity, and settings layout.

**Architecture:** Keep account presentation local to the existing `Sidebar` component because this change introduces no data source or navigation behavior. Use semantic markup in `Sidebar.tsx`, component-scoped rules in `Sidebar.css`, and a Node source-contract test that verifies the approved static structure and stable sizing.

**Tech Stack:** React 19, TypeScript, Lucide React, CSS, Node test runner

---

### Task 1: Add The User Area Contract

**Files:**

- Create: `tests/sidebar-user-area.test.mjs`
- Modify: `tests/workspace-layout.test.mjs`
- Modify: `src/renderer/src/components/Sidebar/Sidebar.tsx`
- Modify: `src/renderer/src/components/Sidebar/Sidebar.css`

- [ ] **Step 1: Write the failing markup and style tests**

Create `tests/sidebar-user-area.test.mjs` with tests that read the component sources and assert the approved contract:

```js
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

function getRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = sidebarStyles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))

  assert.ok(match, `Expected CSS rule for ${selector}`)
  return match[1]
}

test('renders the approved avatar and two-line account identity', () => {
  assert.doesNotMatch(sidebarSource, /UserRound/)
  assert.match(sidebarSource, /className="studio-sidebar__avatar"[^>]*>\s*KA\s*</)
  assert.match(sidebarSource, /className="studio-sidebar__identity"/)
  assert.match(sidebarSource, /className="studio-sidebar__nickname">kasixmb</)
  assert.match(sidebarSource, /className="studio-sidebar__plan">Plus</)
})

test('uses the approved compact dimensions and red avatar treatment', () => {
  const avatarRule = getRule('.studio-sidebar__avatar')
  const identityRule = getRule('.studio-sidebar__identity')

  assert.match(avatarRule, /flex:\s*0 0 24px/)
  assert.match(avatarRule, /width:\s*24px/)
  assert.match(avatarRule, /height:\s*24px/)
  assert.match(avatarRule, /background:\s*#ef493f/)
  assert.match(identityRule, /flex-direction:\s*column/)
})
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `node --test tests/sidebar-user-area.test.mjs`

Expected: FAIL because `UserRound` is still rendered and the `KA`, identity, plan, and 24px red avatar contract do not exist yet.

- [ ] **Step 3: Implement the approved component markup**

In `Sidebar.tsx`, remove `UserRound` from the Lucide import and replace the existing avatar/nickname section with:

```tsx
<div className="studio-sidebar__avatar" aria-hidden="true">
  KA
</div>

<div className="studio-sidebar__identity">
  <span className="studio-sidebar__nickname">kasixmb</span>
  <span className="studio-sidebar__plan">Plus</span>
</div>
```

Keep the existing `Settings` button markup unchanged.

- [ ] **Step 4: Update the existing sidebar layout contract**

In `tests/workspace-layout.test.mjs`, replace the obsolete `UserRound` and single-line placeholder assertions with checks for `KA`, the identity wrapper, `kasixmb`, `Plus`, and the unchanged settings accessibility label. Keep the bottom-row layout assertions.

- [ ] **Step 5: Implement the approved component styles**

Update `Sidebar.css` so the avatar uses a fixed 24px red circle with centered white initials. Add an identity wrapper with `min-width: 0`, column flow, and a 1px gap. Style the nickname at 12px and the plan at 10px, and give both lines ellipsis overflow. Preserve the 40px user row, settings button styles, and light sidebar background.

- [ ] **Step 6: Run the focused test and verify it passes**

Run: `node --test tests/sidebar-user-area.test.mjs`

Expected: 2 tests pass, 0 fail.

### Task 2: Verify The Desktop Build

**Files:**

- Test: `tests/sidebar-user-area.test.mjs`
- Verify: `src/renderer/src/components/Sidebar/Sidebar.tsx`
- Verify: `src/renderer/src/components/Sidebar/Sidebar.css`

- [ ] **Step 1: Run the complete automated checks**

Run these commands and require exit code 0 from each:

```powershell
npm test
npm run lint
npm run typecheck
npm run build
```

- [ ] **Step 2: Inspect the final diff and working tree**

Run:

```powershell
git diff --check
git diff -- src/renderer/src/components/Sidebar/Sidebar.tsx src/renderer/src/components/Sidebar/Sidebar.css tests/sidebar-user-area.test.mjs
git status --short
```

Expected: no whitespace errors; only the planned sidebar files and test are part of this implementation, while the pre-existing `TitleBar.tsx` modification remains untouched.

- [ ] **Step 3: Commit only the implementation files**

```powershell
git add -- src/renderer/src/components/Sidebar/Sidebar.tsx src/renderer/src/components/Sidebar/Sidebar.css tests/sidebar-user-area.test.mjs docs/superpowers/plans/2026-07-31-sidebar-user-area.md
git commit -m "feat: refine sidebar user area"
```
