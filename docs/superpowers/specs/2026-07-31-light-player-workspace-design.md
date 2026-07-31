# Light Editor Workspace Design

## Goal

Build the editing interface entirely inside the existing middle `WorkspaceView`, while leaving the outer menu sidebar and AI conversation panel unchanged.

## Confirmed Structure

```text
Outer application layout (unchanged)
┌──────────────┬──────────────────────────────────────┬──────────────┐
│ Menu sidebar │ Middle WorkspaceView                 │ AI panel     │
│              │ ┌──────────┬──────────┬───────────┐ │              │
│              │ │ 功能区   │ 播放器   │ 参数区    │ │              │
│              │ ├──────────┴──────────┴───────────┤ │              │
│              │ │ 时间线横跨内部三个区域          │ │              │
│              │ └─────────────────────────────────┘ │              │
└──────────────┴──────────────────────────────────────┴──────────────┘
```

The timeline spans the three regions inside `WorkspaceView`. It does not span the outer menu sidebar or AI panel.

## Scope

- Keep `App`, `Layout`, `Sidebar`, `AiPanel`, authentication, and the outer three-column resize behavior unchanged.
- Change `WorkspaceView` and its component-owned styles only.
- Add a timeline subcomponent inside the `WorkspaceView` component directory.
- Build the first phase as a static interface without media, editing, or parameter state.

## Workspace Architecture

- `WorkspaceView` owns an outer vertical resizable group.
- The upper panel owns a nested horizontal resizable group with `功能区`, `播放器`, and `参数区`.
- The lower panel renders `Timeline` across the full width of `WorkspaceView`.
- Two vertical separators resize the three upper regions.
- One horizontal separator resizes the top workspace and timeline.

The initial height split is approximately 68% upper workspace and 32% timeline. The upper width split favors the player while leaving compact tool and parameter panels on both sides.

## Upper Regions

### 功能区

Use a compact panel header and a vertical tool list for media, text, audio, and visual functions. The media tool is visually selected. Controls remain disabled until their editing flows exist.

### 播放器

Keep the current light player presentation: compact header, centered 9:16 preview, time display, centered play control, and view controls.

### 参数区

Use a compact panel header, visual/audio tabs, and disabled base controls for position, scale, and rotation. The fields establish the intended inspector layout without introducing selection state.

## Timeline

The timeline contains a compact toolbar, time ruler, red playhead, aligned video/audio track headers, and empty lanes. Editing and zoom controls remain disabled in this phase.

## Visual Design

- Use white and neutral light-gray surfaces with subtle structural borders.
- Keep controls dense, square, and at 4px corner radii.
- Use Lucide icons for tools and familiar commands.
- Use red only for the playhead and restrained teal for the current player time.
- Do not add cards, shadows, decorative copy, or marketing-style content.

## Responsive Behavior

- All nested groups use zero minimum dimensions so content can shrink inside the existing middle panel.
- Compact pixel minimums keep the player visible at the outer layout's existing 430px middle-panel minimum.
- Fixed header, toolbar, ruler, and track dimensions prevent layout movement.
- The outer menu sidebar and AI panel retain their current widths, contents, and resize handles.

## Verification

- Tests confirm that `App` and `Layout` still compose only the original outer three regions.
- Tests confirm that `WorkspaceView` owns the vertical group, nested horizontal group, three upper regions, and full-width internal timeline.
- Focused tests verify the player, timeline, panel labels, resize handles, and stable dimensions.
- Run focused tests, lint, type checking, production build, and `git diff --check`.
- Inspect the default desktop window and confirm that the new interface stays between the unchanged menu and AI panels.
