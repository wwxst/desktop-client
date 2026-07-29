# Workspace Composition Design

## Goal

Make `Layout` the only owner of the authenticated three-column page structure. `WorkspaceView` must render only the center workspace content.

## Component Tree

```text
App
└── Layout
    ├── Sidebar
    ├── WorkspaceView
    └── AiPanel
```

`App` renders the three business components through `Layout`:

```tsx
<Layout
  sidebar={<Sidebar />}
  content={<WorkspaceView />}
  aiPanel={<AiPanel />}
/>
```

## Responsibilities

- `Layout`: grid columns, region boundaries, minimum dimensions, overflow, and responsive column widths. It contains no menu, workspace, account, subscription, or AI business content.
- `Sidebar`: product identity, navigation items, active menu state display, subscription entry, and current account display.
- `WorkspaceView`: current menu heading, workspace actions, and center content placeholder.
- `AiPanel`: current context, AI empty state, and AI input area.
- `App`: authenticated view composition, selected menu state, login/subscription flow, and callbacks shared across regions.

## Shared Navigation State

The selected menu affects all three business regions, so `App` owns `activeMenu`. A shared `workspaceNavigation.ts` module owns the `MenuKey`, `MenuItem`, and menu configuration used to derive the current menu.

## Styling

- `layouts/Layout.css` owns all three-column layout rules previously attached to `.studio-shell`.
- `components/Sidebar.css` owns `studio-sidebar`, navigation, subscription, and account rules.
- `components/WorkspaceView.css` owns only center workspace rules.
- `components/AiPanel.css` owns only AI panel rules.
- All stylesheets retain module-level Chinese comments.
- The old `components/Workspace.tsx` and `components/Workspace.css` are removed after their active content is migrated.

## Component Directories

Each business component uses a PascalCase directory containing a same-named TSX file and stylesheet. No `index.ts` or `index.tsx` barrel is added, so file names remain explicit in editor tabs, searches, and error paths.

```text
components/
├── Activation/Activation.tsx + Activation.css
├── AiPanel/AiPanel.tsx + AiPanel.css
├── Sidebar/Sidebar.tsx + Sidebar.css
├── WorkspaceView/WorkspaceView.tsx + WorkspaceView.css
└── shared/workspaceNavigation.ts
```

## Verification

- Static source checks confirm that `App` renders `Layout` and all three child components.
- Static source checks confirm that `WorkspaceView` contains no sidebar, AI panel, or three-column shell markup.
- `npm run lint -- --quiet` and `npm run build` must pass.
