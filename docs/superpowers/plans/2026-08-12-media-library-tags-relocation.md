# 全局素材标签与重新定位实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为全局素材库增加持久化标签、标签筛选和保留原 ID 的失效素材重新定位。

**Architecture:** Main 的版本化 JSON 索引继续作为事实来源；标签是索引元数据，重新定位由 Main 原生文件选择和文件校验完成。Preload 只暴露三个业务级 API，Renderer 通过响应刷新列表，不直接读取文件系统。

**Tech Stack:** Electron Main IPC, contextBridge Preload, React 19, TypeScript, Vitest, Testing Library.

---

### Task 1: Extend the shared media contract and store metadata

**Files:**
- Modify: `src/shared/mediaLibrary.ts`
- Modify: `src/main/mediaLibrary/mediaLibraryStore.ts`
- Test: `src/main/mediaLibrary/mediaLibraryStore.test.ts`

- [x] Write failing tests for legacy records loading with empty tags, normalized tag add/remove, and relocation preserving `id`/`importedAt` while refreshing source metadata.
- [x] Run the focused store tests and verify they fail because the APIs and tags field do not exist.
- [x] Implement version-compatible parsing, tag normalization, `addTag`, `removeTag`, and `relocateAsset` in the store.
- [x] Run the focused store tests and verify they pass.

### Task 2: Add native selection IPC and Preload methods

**Files:**
- Modify: `src/main/mediaLibrary/registerMediaLibraryIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Test: `tests/global-media-library-ipc-contract.test.ts`

- [x] Write failing contract assertions for tag add/remove and relocation channels plus matching renderer API methods.
- [x] Run the focused IPC contract test and verify it fails.
- [x] Register the handlers with owner-window native dialogs, structured cancel/error responses, and no generic file-system API.
- [x] Run the focused IPC contract and executable Main/Preload tests and verify they pass.

### Task 3: Add tag controls, filtering, and relocation UI

**Files:**
- Modify: `src/renderer/src/components/MediaLibrary/MediaLibraryView.tsx`
- Modify: `src/renderer/src/components/MediaLibrary/MediaLibrary.css`
- Modify: `tests/global-media-library-view.test.tsx`

- [x] Write failing UI tests for tag add/remove, tag filtering, and relocating a missing asset.
- [x] Run the focused UI tests and verify they fail.
- [x] Implement accessible tag controls, combined type/tag filtering, and a missing-only relocation button using `window.api`.
- [x] Run the focused UI tests and verify they pass.

### Task 4: Document deferred project references and managed-cache ownership

**Files:**
- Modify: `docs/architecture/current.md`
- Modify: `docs/contracts/electron-ipc.md`

- [x] Record the new media-library business IPC methods and the current non-goals: no project reference counts and no cache deletion.
- [x] State that `sourcePath` is user-owned and never a cleanup target; defer counts until project persistence and stable ID mapping exist.

### Task 5: Validate and commit

**Files:**
- Modify: none

- [x] Run `npm test -- --reporter=dot`, `npm run typecheck`, `npm run build`, `npm run lint`, and `git diff --check` after final review fixes.
- [x] Review the diff for original ID preservation and no project/cache implementation.
- [ ] Commit the feature stage and verify local/remote hashes after pushing.
