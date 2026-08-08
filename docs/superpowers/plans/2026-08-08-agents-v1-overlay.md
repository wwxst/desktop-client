# Agents V1 Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the supplied Agents V1 novel-decompression workflow into the Electron main/preload layers with typed IPC, deterministic fallbacks, and verified artifacts.

**Architecture:** Keep all Agent orchestration in `src/main/agent/**`, share only serializable request/result types from `src/shared/agent/**`, and expose a narrow `window.api` surface through preload. The renderer remains unchanged in this V1; EditorTool emits the existing editor command contract and FFmpeg remains an optional fallback exporter.

**Tech Stack:** Electron 39, React/TypeScript, Vitest, Node `fetch`/child processes, existing local sherpa-onnx TTS services, FFmpeg/ffprobe when explicitly available.

---

### Task 1: Create isolated worktree and verify baseline

**Files:**
- Worktree: `.worktrees/agents-v1-overlay/`
- No source changes

- [ ] **Step 1: Verify worktree directory is ignored**

Run `git check-ignore -q .worktrees` and require exit code 0.

- [ ] **Step 2: Create the feature worktree**

Run `git worktree add .worktrees/agents-v1-overlay -b feature/agents-v1-overlay HEAD`.

- [ ] **Step 3: Run the clean baseline suite**

From the worktree run `npm test -- --run`, `npm run typecheck`, and `npm run lint -- --quiet`. Record any pre-existing failure before continuing.

### Task 2: Add failing Agent boundary tests

**Files:**
- Create: `tests/agent-runtime.test.ts`
- Create: `tests/agent-workflow-runner.test.ts`
- Create: `tests/agent-ipc-contract.test.ts`

- [ ] **Step 1: Test model configuration validation and key isolation**

Assert that blank `baseUrl`, `apiKey`, or `model` throws, and that `getStatus()` returns `configured`, `baseUrl`, and `model` without an `apiKey` property.

- [ ] **Step 2: Test disabled-model fallback**

Call `AgentRuntime.runWithFallback('disabled', ...)` and assert the model callback is not invoked and the fallback value is returned.

- [ ] **Step 3: Test task lifecycle**

Use a stub workflow with a deferred promise, assert `startNovelDecompression()` returns a task id and `getTask()` reports `running`, then cancel and resolve/reject the workflow to assert the final `cancelled` snapshot and progress event.

- [ ] **Step 4: Run only the new tests and verify the intended failures**

Run `npm test -- --run tests/agent-runtime.test.ts tests/agent-workflow-runner.test.ts tests/agent-ipc-contract.test.ts`; the imports or missing IPC contract should fail before the package is installed.

### Task 3: Apply payload and wire main/preload IPC

**Files:**
- Create: `src/main/agent/**` from the package payload
- Create: `src/shared/agent/editingPlan.ts`
- Create: `src/shared/agent/workflow.ts`
- Create: `tests/agent-planning.test.ts` from the package payload
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: Run the supplied installer in the worktree**

Run `node <extracted-package>\\install-agents.mjs` from the worktree root. Confirm it creates only the documented backup directory, Agent payload files, and three entry-point modifications.

- [ ] **Step 2: Remove generated backup metadata from the feature branch**

Delete only the installer-created `.agent-package-backup-*` directory after comparing its files with the pre-install baseline; do not remove any pre-existing directory.

- [ ] **Step 3: Make IPC registration idempotent and typed**

Retain `registerAuthIpc()`, `registerSubscriptionIpc()`, and `registerTtsIpc()`; call `registerAgentIpc()` once after them. Keep preload methods and `DesktopApi` declarations identical and ensure no API key is returned by status.

- [ ] **Step 4: Run the Agent planning tests**

Run `npm test -- --run tests/agent-planning.test.ts tests/agent-runtime.test.ts tests/agent-workflow-runner.test.ts tests/agent-ipc-contract.test.ts` and require all tests to pass.

### Task 4: Fix integration and lifecycle issues exposed by tests

**Files:**
- Modify: `src/main/agent/registerAgentIpc.ts`
- Modify: `src/main/agent/runtime/WorkflowRunner.ts`
- Modify: `src/main/agent/tools/MediaTool.ts`
- Modify: `src/main/agent/tools/ExportTool.ts`
- Modify: `src/main/agent/tools/TtsTool.ts`
- Modify: related Agent tests

- [ ] **Step 1: Validate IPC inputs before dispatch**

Reject non-object model configs, blank task ids, invalid output/media paths, and non-finite canvas/TTS values with `{ success: false, message }`; do not start a child process for rejected requests.

- [ ] **Step 2: Make cancellation observable and bounded**

Ensure an aborted workflow cannot later overwrite a cancelled snapshot as completed, and ensure spawned ffmpeg/ffprobe processes receive the abort signal and remove listeners on close.

- [ ] **Step 3: Preserve safe artifact semantics**

Keep generated plans and commands in per-task directories, avoid returning API keys, and keep FFmpeg overlay limitations documented rather than silently fabricating unsupported output.

- [ ] **Step 4: Re-run focused tests after each fix**

Run the affected test file after each change, then run the full suite before moving to the final verification task.

### Task 5: Full verification and merge

**Files:**
- Modify only files covered by Tasks 2-4 and the two docs committed on the base branch

- [ ] **Step 1: Run the complete acceptance sequence**

From the feature worktree run, in order:

```text
npm test -- --run
npm run typecheck
npm run lint -- --quiet
npm run build
git diff --check
```

All commands must exit 0; a checker that emits errors while returning 0 is treated as failed.

- [ ] **Step 2: Review the diff and file list**

Run `git diff --stat`, `git diff --name-status`, and `git status --short`; confirm no existing TTS, renderer, or unrelated files were deleted and no backup directory is tracked.

- [ ] **Step 3: Commit the feature branch**

Run `git add src/main/agent src/shared/agent src/main/index.ts src/preload/index.ts src/preload/index.d.ts tests` followed by `git commit -m "feat: add agents v1 workflow"`.

- [ ] **Step 4: Merge and push from main**

Fast-forward `main` to the feature commit, push `main`, then compare `git rev-parse HEAD` with `git ls-remote origin refs/heads/main`.
