# Sidebar User Area Design

## Goal

Update the user area at the bottom of the workspace sidebar to match the approved compact account layout while preserving the application's existing light sidebar theme.

## Scope

- Change only `src/renderer/src/components/Sidebar/Sidebar.tsx` and its component stylesheet.
- Keep the existing menu, sidebar dimensions, active state, and resizing behavior unchanged.
- Do not add settings navigation or account data fetching in this change.

## Visual Design

- Keep the user row at the bottom of the sidebar with a stable 40px height.
- Replace the generic user icon with a 24px red circular avatar containing the white initials `KA`.
- Display `kasixmb` as the primary line and `Plus` as the smaller secondary line.
- Truncate both text lines when the sidebar is narrowed.
- Keep the right-side control as the existing Lucide `Settings` gear icon.
- Preserve the current light gray sidebar background. The user row does not receive a permanent contrasting background.

## Interaction And Accessibility

- Keep the settings control as a semantic button with its existing `aria-label` and tooltip.
- Preserve the existing hover and keyboard-focus feedback for the settings button.
- Treat the avatar initials as decorative because the adjacent nickname identifies the account.

## Verification

- Add or update a focused source-level test if the repository's existing test approach supports this component contract.
- Run the project test suite, lint, type checking, and production build.
- Inspect the rendered workspace at the default 220px sidebar width and at its 160px minimum width to confirm alignment, truncation, and absence of overlap.
