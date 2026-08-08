# Agents V1 Overlay Design

## Goal

Integrate the supplied Agents V1 package into the existing Electron desktop client so the main process can run the novel-decompression workflow and expose a narrow, typed preload API without changing renderer UI behavior.

## Architecture

The package adds an isolated `src/main/agent` module with model-backed Story, edit-planning, and review agents plus deterministic fallbacks. The workflow reuses the existing TTS engine, scans local video assets, writes `EditingPlan` and `EditorCommand` artifacts, and optionally invokes FFmpeg. Shared request/result types live under `src/shared/agent`.

The main process registers Agent IPC handlers beside the existing auth, subscription, and TTS handlers. The preload exposes only model configuration/status, workflow start/query/cancel, and progress subscription methods; API keys remain in main-process memory and are never returned to the renderer.

## Compatibility And Safety

- Preserve existing auth, subscription, TTS, renderer, and editor files not included in the package.
- Apply the package's three entry-point patches only after validating their markers in an isolated copy.
- Validate model configuration and workflow identifiers at the IPC boundary; reject malformed requests without starting child processes.
- Treat FFmpeg output as a V1 fallback renderer that emits the documented artifacts; do not claim overlay rendering that the fallback does not implement.
- Keep generated artifacts under the requested output directory or the app documents directory, and keep task state in main-process memory.

## Verification

Add focused tests for deterministic plan/command generation, model status/key isolation, fallback behavior, and task lifecycle/cancellation. Run the full Vitest suite, node and web type checks, quiet ESLint, Electron build, and `git diff --check` before committing. Verify the pushed `main` ref matches the local commit hash.
