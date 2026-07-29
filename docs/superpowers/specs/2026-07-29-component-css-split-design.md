# Component CSS Split Design

## Goal

Split the renderer's monolithic `assets/main.css` into stylesheets owned by the components that use them, and remove selectors that are confirmed to have no matching JSX usage. The refactor must not intentionally change the rendered UI.

## Current State

- `main.tsx` imports `assets/main.css`, which in turn imports `base.css`.
- `main.css` contains login, toast, activation, legacy workspace, editor, and current studio workspace styles.
- `App.tsx` owns the login view and the shared toast markup.
- `components/Activation.tsx` owns the activation view.
- `components/Workspace.tsx` owns the current workspace and uses the `studio-*` selector family.
- No current TSX file references the `editor-*` or old `workspace-*` selector families.
- `layouts/layout.css` is already colocated with its component and remains separate.

## File Ownership

The resulting renderer styles will be organized as follows:

- `assets/base.css`: global reset and document-level defaults only; imported by `main.tsx`.
- `App.css`: login view, form state, and toast styles; imported by `App.tsx`.
- `components/Activation.css`: activation view styles; imported by `Activation.tsx`.
- `components/Workspace.css`: current `studio-*` workspace styles; imported by `Workspace.tsx`.
- `layouts/Layout.css`: existing layout styles; imported by `Layout.tsx` with matching PascalCase path casing.

`assets/main.css` will be removed after all active rules have been moved to their owning files.

## Cleanup Scope

Remove selector families that have no references in the current renderer TSX:

- All `editor-*` rules, including both duplicated editor theme blocks and their media rules.
- The old `workspace-*` rules superseded by the current `studio-*` workspace.
- Unreferenced duplicate login selectors such as `remember-password`, `text-button`, `register-button`, and `login-error` when a final reference scan confirms they remain unused.

The existing `studio-*`, `activation-*`, login, form, and toast declarations will be moved without visual redesign. Selector names will remain unchanged, so JSX changes are limited to stylesheet imports.

## Import Flow

`main.tsx` will import `./assets/base.css`. Each rendered component will import its own stylesheet directly. This makes style dependencies explicit and ensures styles load whenever their owning component is included.

Because the views are mutually exclusive and their selectors already use distinct prefixes, moving the rules does not require CSS Modules or class name changes. Existing rule order within each selector family will be preserved to avoid cascade changes.

## Verification

Verification will include:

1. Search all TSX class names against the remaining CSS to catch missing active selectors.
2. Confirm no `editor-*` or old `workspace-*` references remain in renderer source.
3. Run `npm run typecheck:web` to validate imports and filename casing.
4. Run `npm run lint` and `npm run build` as repository acceptance checks.
5. Start the renderer and smoke-check the login, workspace, activation, and toast views for visual regressions when the local Electron environment permits it.

## Non-Goals

- No conversion to CSS Modules.
- No visual redesign or selector renaming.
- No component logic refactor.
- No changes to layout structure beyond correcting stylesheet import casing.
