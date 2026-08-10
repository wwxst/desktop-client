# Project Documentation Governance Implementation Plan

> **For agentic workers:** This plan records the repository documentation rollout. Follow the root `AGENTS.md` and the scoped rules before editing project files.

**Goal:** Establish a small, path-routed documentation system that separates current facts, hard rules, stable contracts, product direction, plans, and historical snapshots.

**Architecture:** Keep `AGENTS.md` files short and rule-focused. Use `docs/README.md` as the load map, current architecture/contracts as source-linked facts, and dated plans/audits as explicitly non-current records. Do not change application behavior.

**Tech Stack:** Markdown, Git, existing Electron/React/TypeScript source and Vitest tests.

---

### Task 1: Define the document routing layer

**Files:**
- Create: `AGENTS.md`
- Create: `docs/README.md`
- Create: `src/main/AGENTS.md`
- Create: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/AGENTS.md`
- Create: `tests/AGENTS.md`

- [x] Keep global rules limited to process boundaries, editor invariants, naming, scope, verification, and documentation maintenance.
- [x] Add task-based routes so agents load only the documents relevant to Main/Preload, Editor V2, tests, TTS/Agent, or product work.

### Task 2: Capture current architecture and contracts

**Files:**
- Create: `docs/architecture/current.md`
- Create: `docs/contracts/electron-ipc.md`
- Create: `docs/contracts/editor-v2.md`

- [x] Document the current Main/Preload/Renderer boundary and actual `window.api` surface.
- [x] Document Editor V2 state ownership, Service/Placement Policy, command compatibility, playback and interaction runtime state.
- [x] Mark persistence, editor file IPC, Ripple editing, audio waveform, subtitles, and keyframes as non-current capabilities.

### Task 3: Establish verification and history boundaries

**Files:**
- Create: `docs/verification.md`
- Create: `docs/archive/2026-08-10-editor-v2-integration-hotfix-01.md`
- Modify: `README.md`
- Modify: `docs/DEVELOPMENT.md`

- [x] Replace the patch-package root README with a stable project entry and preserve the original note in archive.
- [x] Record the latest test, typecheck, build, diff, and known lint baseline without claiming lint is clean.
- [x] Mark the V1 development guide as a compatibility entry so it cannot override current V2 documents.

### Task 4: Verify the documentation rollout

**Files:**
- Verify: all files above and their relative Markdown links

- [x] Check every new link target and referenced path exists.
- [x] Run `git diff --check`.
- [x] Confirm no application source or test behavior changed.
