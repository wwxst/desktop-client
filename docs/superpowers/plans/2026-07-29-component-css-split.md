# Component CSS Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the renderer's monolithic stylesheet with component-owned stylesheets while removing CSS that current TSX does not use.

**Architecture:** Global reset rules remain in `assets/base.css` and are loaded once by `main.tsx`. `App.tsx`, `Activation.tsx`, and `Workspace.tsx` each import a colocated plain CSS file containing only the selectors owned by that view; selector names and active declaration order remain unchanged.

**Tech Stack:** Electron, React 19, TypeScript 5.9, Vite 7, plain CSS, ESLint, Prettier

---

### Task 1: Move App-Owned Styles

**Files:**
- Create: `src/renderer/src/App.css`
- Modify: `src/renderer/src/App.tsx`
- Source: `src/renderer/src/assets/main.css`

- [ ] **Step 1: Record the active App selector families**

Run:

```powershell
rg -n "login-|toast-|form-|field-|password-|remember-|register-|contact-|brand-logo" src/renderer/src/App.tsx
```

Expected: matches for the login form, form error state, password toggle, registration/contact actions, and toast. There must be no matches for `remember-password`, `text-button`, `register-button`, or `login-error`.

- [ ] **Step 2: Create the App stylesheet**

Move declarations for the following active selectors from the beginning of `main.css`, preserving their order and values:

```text
.login-page .login-container .brand-logo .login-heading .login-form
.form-group .form-field .form-field--error .field-icon .field-error
.password-toggle .login-options .remember-option .text-link
.login-button .register-row .contact-button .login-footer
.toast-message .toast-icon @keyframes toast-enter
```

Do not copy the unused `remember-password`, `text-button`, `register-button`, or `login-error` rules.

- [ ] **Step 3: Import the stylesheet from App**

Add this import after the React import in `App.tsx`:

```tsx
import './App.css'
```

- [ ] **Step 4: Verify App selector coverage**

Run:

```powershell
rg -n "^\.(login|form|field|password|remember|text-link|register|contact|toast|brand-logo)" src/renderer/src/App.css
```

Expected: active App selectors are present and the four unused selectors are absent.

### Task 2: Move Activation Styles

**Files:**
- Create: `src/renderer/src/components/Activation.css`
- Modify: `src/renderer/src/components/Activation.tsx`
- Source: `src/renderer/src/assets/main.css`

- [ ] **Step 1: Create the activation stylesheet**

Move the complete `.activation-*` rule block to `components/Activation.css`, preserving these selectors and their pseudo states:

```text
.activation-page .activation-back .activation-card .activation-logo
.activation-status .activation-tip
.activation-card h1
.activation-card header p
.activation-card form
.activation-card form label
.activation-card form input
.activation-card form input:focus
.activation-card form button
.activation-card form button:disabled
```

- [ ] **Step 2: Import the activation stylesheet**

Add after the React import in `components/Activation.tsx`:

```tsx
import './Activation.css'
```

- [ ] **Step 3: Verify activation ownership**

Run:

```powershell
rg -n "activation-" src/renderer/src/components/Activation.tsx src/renderer/src/components/Activation.css
```

Expected: JSX references and CSS definitions appear only in the activation component pair.

### Task 3: Move Current Workspace Styles

**Files:**
- Create: `src/renderer/src/components/Workspace.css`
- Modify: `src/renderer/src/components/Workspace.tsx`
- Source: `src/renderer/src/assets/main.css`

- [ ] **Step 1: Confirm the active workspace prefix**

Run:

```powershell
rg -n "className=.*(studio-|workspace-|editor-)" src/renderer/src/components/Workspace.tsx
```

Expected: only `studio-*` class names are used.

- [ ] **Step 2: Create the workspace stylesheet**

Move the entire current studio section, beginning with `.studio-shell, .studio-shell *` and ending with the `@media (max-width: 1120px)` block, into `components/Workspace.css`. Preserve all `studio-*` selectors, declarations, and media rules exactly. Do not move either `editor-*` block or the old `workspace-*` block.

- [ ] **Step 3: Import the workspace stylesheet**

Add after the React import in `components/Workspace.tsx`:

```tsx
import './Workspace.css'
```

- [ ] **Step 4: Verify workspace cleanup**

Run:

```powershell
rg -n "editor-|^\.workspace-" src/renderer/src/components/Workspace.tsx src/renderer/src/components/Workspace.css
```

Expected: no output.

### Task 4: Remove the Monolithic Entry

**Files:**
- Modify: `src/renderer/src/main.tsx`
- Modify: `src/renderer/src/layouts/Layout.tsx`
- Delete: `src/renderer/src/assets/main.css`

- [ ] **Step 1: Load only global CSS at the renderer entry**

Replace the first line of `main.tsx` with:

```tsx
import './assets/base.css'
```

- [ ] **Step 2: Keep layout stylesheet path casing consistent**

Use the PascalCase filename already present on disk:

```tsx
import './Layout.css'
```

- [ ] **Step 3: Delete the migrated monolithic stylesheet**

Delete `assets/main.css`. This removes the unreferenced `editor-*`, legacy `workspace-*`, and unused duplicate login rules after all active declarations have moved.

- [ ] **Step 4: Check for stale references**

Run:

```powershell
rg -n "main\.css|editor-|^\.workspace-" src/renderer/src
```

Expected: no output.

### Task 5: Verify the Refactor

**Files:**
- Verify: `src/renderer/src/**/*.tsx`
- Verify: `src/renderer/src/**/*.css`

- [ ] **Step 1: Check formatting and whitespace errors**

Run:

```powershell
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 2: Run renderer type checking**

Run:

```powershell
npm run typecheck:web
```

Expected: exit code 0 with no TypeScript or stylesheet import casing errors.

- [ ] **Step 3: Run lint**

Run:

```powershell
npm run lint
```

Expected: exit code 0.

- [ ] **Step 4: Build the application**

Run:

```powershell
npm run build
```

Expected: exit code 0 and Electron Vite emits main, preload, and renderer bundles.

- [ ] **Step 5: Smoke-check the renderer**

Run:

```powershell
npm run dev
```

Expected: Electron opens with the login view styled as before and the renderer console has no missing stylesheet errors. When the configured backend permits login, also open the workspace and activation views and confirm their layouts remain styled; if authentication is unavailable, record that constraint and rely on the successful production bundle plus selector coverage checks for those two views.

- [ ] **Step 6: Inspect the final diff**

Run:

```powershell
git diff --stat
git status --short
```

Expected: component-owned CSS files are present, `main.css` is deleted, and pre-existing component renames remain visible without unrelated changes.
