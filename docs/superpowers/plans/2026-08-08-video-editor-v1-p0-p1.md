# 视频编辑器 V1 P0/P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有 V1 架构的前提下，修复 Editor Core 的 Clip/Track 边界，补齐 Timeline 跨轨拖动，并将 Player 升级为工程时间线 Composition Preview。

**Architecture:** 先在纯函数 Core 中建立唯一的时间范围和轨道兼容规则，再让 Command、旧数据迁移、Timeline 和 Agent 共用这些规则。Player 通过 `selectCompositionAtTime` 获取播放头对应的层，`CompositionPreview` 使用 DOM media layer 渲染，工程播放头由独立的 requestAnimationFrame 时钟驱动。

**Tech Stack:** React 19, TypeScript, Electron/Vite, Vitest, Testing Library, lucide-react。

---

## Baseline and Working Tree

- [ ] Confirm the implementation worktree is `E:\JavaProjects\web-project\desktop-client\.worktrees\codex-video-editor-v1-p0-p1` on `codex/video-editor-v1-p0-p1`.
- [ ] Run `npm test` and `npm run typecheck` before changing production code; record the baseline counts.
- [ ] Keep changes limited to the video editor modules, their tests, and the design/plan records. Preserve unrelated worktree changes.

### Task 1: Clip Math and Project Normalization

**Files:**
- Create: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorClipMath.ts`
- Modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorProject.ts`
- Test: `tests/editor-clip-math.test.ts`
- Test: `tests/editor-project.test.ts`

- [ ] **Step 1: Write failing range-normalization tests.** Cover a source start requested at/after asset duration, a requested end beyond asset duration, a left-boundary request, zero duration, and an asset shorter than `MIN_CLIP_DURATION`.
- [ ] **Step 2: Run `npm test -- tests/editor-clip-math.test.ts tests/editor-project.test.ts` and verify the new tests fail for the missing helper/old invalid output.**
- [ ] **Step 3: Implement `normalizeSourceRange` and left-trim bounds as pure functions.** Use an effective minimum of the real positive asset duration for short media; never return `sourceEnd > assetDuration`.
- [ ] **Step 4: Route `resolveTimelineClip` and `createTimelineClipFromAsset` through the helper.** Reject assets whose duration is non-positive and preserve migration defaults for legacy clips without inventing an overlong source range.
- [ ] **Step 5: Re-run the focused tests and then the existing editor project tests.**

### Task 2: Command Core, Track Compatibility, and Results

**Files:**
- Modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorCommands.ts`
- Modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorHistory.ts`
- Test: `tests/editor-commands.test.ts`

- [ ] **Step 1: Add failing command tests for duplicate Asset instances.** Assert same `assetId`, distinct `clipId` values, independent deletion, and `NO_CHANGE` for duplicate Clip IDs.
- [ ] **Step 2: Add failing tests for trim/update range invariants, speed duration recalculation, and the left/right boundary cases.**
- [ ] **Step 3: Add failing tests for video-to-video/overlay moves, video-to-audio rejection, locked source/target rejection, and non-negative timeline positions.**
- [ ] **Step 4: Run `npm test -- tests/editor-commands.test.ts` and confirm the failures are behavioral rather than test setup errors.**
- [ ] **Step 5: Implement a single `EditorExecutionResult` path for command reduction.** Return explicit codes for not found, invalid range, locked tracks, incompatible tracks, unchanged commands, and successful changes while keeping the resulting state available to History.
- [ ] **Step 6: Make `clip/trim`, `clip/update`, `clip/split`, `clip/move`, and `clip/duplicate` use the Core helpers.** Remove the old `Math.max(sourceStart + MIN_CLIP_DURATION, assetDuration)` escape hatch.
- [ ] **Step 7: Keep History behavior unchanged for successful commands and ensure failed/no-op commands do not create history entries.**
- [ ] **Step 8: Run the focused command/history tests and the full existing suite.**

### Task 3: Repeatable Media Add Flow

**Files:**
- Modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/VideoEditorWorkspace.tsx`
- Modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/FunctionPanel.tsx`
- Modify: `tests/function-panel.test.tsx`
- Modify: `tests/editor-project.test.ts`

- [ ] **Step 1: Update the FunctionPanel test to render one ready item and click its add control three times, expecting three callbacks.** Run the focused test to verify the old `addedMediaIds` contract fails.
- [ ] **Step 2: Remove `addedMediaIds` from the FunctionPanel props and workspace derivation.** Keep the add button enabled whenever `mediaItem.status === 'ready'`; retain the loading/error disabled state and accessible labels.
- [ ] **Step 3: Extend the compatibility reducer test so `timeline/assetAdded` can create repeated clips with unique IDs.**
- [ ] **Step 4: Run `npm test -- tests/function-panel.test.tsx tests/editor-project.test.ts` and confirm the new repeat-add behavior is green.**

### Task 4: Timeline Trim Boundaries

**Files:**
- Modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/Timeline.tsx`
- Test: `tests/timeline.test.tsx`

- [ ] **Step 1: Add pointer-event tests that drag the left handle past timeline zero and the source start, and the right handle past asset duration.** Assert the exact trim payload received by `onTrimClip`.
- [ ] **Step 2: Run the focused Timeline tests and verify the new boundary assertions fail against the existing calculations.**
- [ ] **Step 3: Use the Core left-trim helper in the move/trim preview calculation.** Remove the `Math.max(0, ...)` masking once the delta bounds guarantee a non-negative timeline start.
- [ ] **Step 4: Clamp right-trim preview to the real asset duration and preserve the minimum duration.**
- [ ] **Step 5: Re-run `tests/timeline.test.tsx` and the existing selection/row/zoom tests.**

### Task 5: Timeline Cross-Track Dragging

**Files:**
- Modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/Timeline.tsx`
- Modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/Timeline.css`
- Modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorCommands.ts` (only if Task 2 leaves a compatibility gap)
- Test: `tests/timeline.test.tsx`

- [ ] **Step 1: Add failing pointer tests that move a clip from V1 into V2, then into A1, and onto a locked target.** Assert the successful callback includes the target track ID and invalid drops produce no callback.
- [ ] **Step 2: Run the focused tests and verify the failure is caused by missing Y/track state.**
- [ ] **Step 3: Extend `DragState` with `startClientY` and `previewTrackId`; index row elements with `data-track-id`; resolve the pointer’s target row from `clientY`.**
- [ ] **Step 4: Mark valid/invalid target rows with `data-drop-target`/`data-drop-invalid` and add restrained CSS feedback.**
- [ ] **Step 5: Submit one `onMoveClip(clipId, timelineStart, trackId)` on Pointer Up only for a valid unlocked compatible target.**
- [ ] **Step 6: Run Timeline tests plus editor command tests to verify UI and Core double validation agree.**

### Task 6: Composition Selector

**Files:**
- Create or modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorProject.ts`
- Test: `tests/editor-project.test.ts`
- Test: `tests/composition-selector.test.ts`

- [ ] **Step 1: Write failing selector tests for playhead gaps, Clip A to Clip B continuity, hidden tracks, muted audio, V1/V2 ordering, and same-track overlap precedence.**
- [ ] **Step 2: Run the focused selector tests and confirm they fail because the selector is absent.**
- [ ] **Step 3: Implement `TimelineComposition` and `selectCompositionAtTime` using resolved clips and project track order.** Return bottom-to-top video layers and non-muted audio layers without coupling to React.
- [ ] **Step 4: Run selector, project, and command tests together.**

### Task 7: Composition Preview and Project Playback Clock

**Files:**
- Create: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/CompositionPreview.tsx`
- Create or modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/CompositionPreview.css`
- Modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/VideoPlayback.tsx`
- Modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/PlayerPanel.tsx`
- Modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/VideoEditorWorkspace.tsx`
- Modify: `tests/player-panel.test.tsx`
- Create: `tests/video-playback.test.tsx`

- [ ] **Step 1: Add failing mounted tests for selected-Clip independence, hidden layers, V2-over-V1 ordering, transform/opacity styles, and project-duration display.**
- [ ] **Step 2: Add a failing clock test with fake timers/animation frames that advances playhead from Clip A into Clip B and stops at project duration.**
- [ ] **Step 3: Implement `CompositionPreview` as a DOM layer renderer.** Reconcile media elements by Clip ID, seek each visible element from project time to source time, apply transform/opacity and track/clip mute, and report media errors by Asset ID.
- [ ] **Step 4: Refactor `VideoPlayback` controls to own play/pause and a requestAnimationFrame project clock.** Remove active Clip clamping and use `getProjectDuration(project)`; keep the current selected Clip only for edit state/parameter panel.
- [ ] **Step 5: Pass project assets/tracks/clips into `PlayerPanel` and preserve ratio-menu and existing media-error behavior.**
- [ ] **Step 6: Run the new playback tests and the existing PlayerPanel tests, then inspect the rendered layer DOM for non-overlapping controls and correct CSS ownership.**

### Task 8: Agent API Result Contract

**Files:**
- Modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorAgentApi.ts`
- Modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/VideoEditorWorkspace.tsx`
- Test: `tests/editor-agent-api.test.ts`

- [ ] **Step 1: Add failing tests for successful, no-op, invalid-track, locked-track, and batch execution result codes.** Verify snapshots remain cloned and Agents never receive mutable React state.
- [ ] **Step 2: Run the focused Agent API tests and verify the old void callback type fails the expected assertions.**
- [ ] **Step 3: Return Core execution results from the workspace callbacks while dispatching only changed commands through History.** Aggregate batch results without introducing a second result shape.
- [ ] **Step 4: Update the registered API types/capabilities and run Agent API, History, and command tests.**

### Task 9: Regression and Final Verification

**Files:**
- Modify only tests or narrowly scoped production code discovered by the prior tasks.

- [ ] **Step 1: Run `npm test` and fix regressions in import/ready/error, selection, split/delete, parameters, ratio changes, hidden/muted/locked tracks, Undo/Redo, and Agent registration.**
- [ ] **Step 2: Run `npm run typecheck` and address all TypeScript errors.**
- [ ] **Step 3: Run `npm run lint` and address all lint errors without broad formatting churn.**
- [ ] **Step 4: Run `npm run build` and inspect the complete output.**
- [ ] **Step 5: Run `git diff --check`, review the diff against the user plan, and record any environment-blocked visual/Electron checks explicitly.**
- [ ] **Step 6: Request a final code review, then present branch integration options only after all verification is fresh and green.**
