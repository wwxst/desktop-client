# Light Player Workspace Design

## Goal

Replace the empty middle workspace with a light-theme player interface based on the supplied reference while keeping the existing resizable three-column layout unchanged.

## Scope

- Change only the middle `WorkspaceView` presentation and its focused tests.
- Keep `Layout`, `Sidebar`, `AiPanel`, authentication, and resize behavior unchanged.
- Do not add media importing, video playback, timeline state, aspect-ratio changes, or fullscreen behavior in this phase.

## Structure

The workspace is divided into three stable rows:

1. A 40px header containing the `播放器` title and a disabled menu button.
2. A flexible preview stage containing a centered 9:16 empty preview canvas.
3. A 44px control bar with time information on the left, a centered disabled play button, and disabled view controls on the right.

The player remains a single component because this phase has no media state or reusable control logic. The semantic sections and class names leave clear extraction points for later playback work.

## Visual Design

- Use the existing application's white and light-gray surfaces instead of the reference image's dark palette.
- Separate header, preview stage, and control bar with subtle neutral borders.
- Use one restrained teal accent for the current time display.
- Keep all icon buttons square with stable dimensions and 4px corner radii.
- Use Lucide icons for menu, empty preview, play, layout, fit, ratio, and fullscreen controls.
- Do not add decorative cards, shadows, gradients, or instructional text.

## Responsive Behavior

- Preserve the existing middle panel minimum width of 430px.
- Use a three-column control-bar grid so the play button stays visually centered.
- Size the preview with `aspect-ratio: 9 / 16`, maximum width and height constraints, and centered alignment.
- Keep both control groups within their own grid tracks so controls cannot overlap at the minimum width.

## Interaction And Accessibility

- Render every control as a semantic button with an accessible label and tooltip.
- Disable controls that require media or unimplemented behavior.
- Give the empty preview canvas an accessible label while keeping its visual treatment icon-only.

## Verification

- Add a source-contract test for the header, preview stage, disabled controls, stable grid rows, and 9:16 canvas.
- Update the existing workspace layout test so it expects the new player shell instead of an empty element.
- Run the focused tests, lint, type checking, production build, and `git diff --check`.
- Capture the Electron renderer at the default middle-panel width and inspect control alignment, preview framing, and overlap.
