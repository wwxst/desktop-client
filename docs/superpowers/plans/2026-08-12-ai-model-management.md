# AI Model Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single AI model form with a provider catalog and an in-memory multi-model registry that supports add, edit, delete, provider-backed configuration, and custom OpenAI-compatible configuration.

**Architecture:** Main owns provider resolution, remote catalog fallback, API keys, and the model registry. Preload exposes narrow catalog and registry IPC methods. Renderer presents a compact model table and a two-mode modal; it never receives API keys or provider Base URLs. No enabled state or default model is introduced, and workflow model selection remains an explicit future task boundary.

**Tech Stack:** Electron Main/Preload IPC, React 19, TypeScript, Vitest, Testing Library, Lucide icons.

---

### Task 1: Shared model catalog and registry contracts

**Files:**
- Modify: `src/shared/agent/workflow.ts`
- Create: `src/main/agent/modelCatalog.ts`
- Test: `tests/agent-model-catalog.test.ts`

- [ ] Add failing tests for the six-provider fallback catalog, provider lookup, and catalog validation.
- [ ] Run `npm test -- --run tests/agent-model-catalog.test.ts` and confirm failure because the catalog module does not exist.
- [ ] Add provider, catalog, registry item, provider-create, custom-create, update, and action response types. Implement the fallback catalog and strict parser without exposing provider Base URLs in public responses.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Main in-memory registry and runtime selection boundary

**Files:**
- Create: `src/main/agent/runtime/ModelRegistry.ts`
- Modify: `src/main/agent/runtime/ModelGateway.ts`
- Test: `tests/agent-model-registry.test.ts`
- Test: `tests/agent-runtime.test.ts`

- [ ] Add failing tests for provider/custom creation, editing without API-key replacement, deletion, no default/enabled fields, and API-key redaction.
- [ ] Run the two focused test files and confirm the expected failures.
- [ ] Implement the registry with generated stable IDs, provider Base URL resolution in Main, and explicit `select(configId)` on `ModelGateway`; retain validation and OpenAI Chat Completions request behavior.
- [ ] Re-run the focused tests and confirm they pass.

### Task 3: Catalog and registry IPC

**Files:**
- Modify: `src/main/agent/registerAgentIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `tests/agent-ipc-contract.test.ts`
- Create: `tests/agent-model-ipc.test.ts`
- Modify: `docs/contracts/electron-ipc.md`

- [ ] Add failing tests for list catalog, list configurations, create, update, delete, and API-key redaction.
- [ ] Run the IPC tests and confirm missing channels/methods fail.
- [ ] Register narrow IPC handlers, call the Java catalog endpoint with fallback to the built-in catalog, update Preload and Window types, and document all channels.
- [ ] Re-run IPC tests and typecheck.

### Task 4: Model management Renderer

**Files:**
- Rewrite: `src/renderer/src/components/Settings/SettingsView.tsx`
- Rewrite: `src/renderer/src/components/Settings/SettingsView.css`
- Rewrite: `tests/settings-view.test.tsx`

- [ ] Add failing user-facing tests for the table without grouping/default/enabled controls, provider modal without Base URL, custom modal without API-format selector, catalog fallback notice, add, edit, delete, and API-key redaction.
- [ ] Run `npm test -- --run tests/settings-view.test.tsx` and confirm the old single form fails the new contract.
- [ ] Implement the compact table and two-mode modal using Lucide icons and the new IPC methods.
- [ ] Re-run Settings, Workspace, Sidebar, and AI panel focused tests.

### Task 5: Current docs, verification, and publish

**Files:**
- Modify: `docs/architecture/current.md`
- Modify: `docs/verification.md`

- [ ] Record Main-owned in-memory registry, provider Base URL secrecy, custom compatibility mode, and the absence of enabled/default behavior.
- [ ] Run `npm test -- --reporter=dot`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Run `npm run lint` and confirm zero errors.
- [ ] Run `git diff --check`.
- [ ] Commit the updated design/plan separately from implementation, then commit implementation/docs, push `main`, and verify local `HEAD` equals `git ls-remote origin refs/heads/main`.
