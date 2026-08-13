# AI Agent Mode and Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the AI panel's Agent mode into a permission-controlled multi-step editing Copilot while keeping Assistant mode read-only.

**Architecture:** Shared code defines a strict serializable plan protocol. Main validates requests and exposes different model tools by mode; Renderer owns persisted mode/approval preferences, computes approval decisions, validates editor revisions, compiles plans through Placement Policy, and submits each approved plan as one editor transaction. `AiPanel` orchestrates the conversation state machine and renders approval controls, but does not duplicate plan validation or editor rules.

**Tech Stack:** Electron Main/Preload IPC, React 19, TypeScript discriminated unions, Vitest, Testing Library, EditorService/EditorPlacementPolicy, browser `localStorage`.

---

## File Map

- Create `src/shared/agent/chatContract.ts`: strict mode-aware request, tool-call, plan-action, and result validation shared by Main and tests.
- Modify `src/shared/agent/workflow.ts`: serializable Agent/Assistant mode, approval, plan, tool-call, and result types.
- Modify `src/main/agent/runtime/ModelGateway.ts`: mode-specific prompts/tools and strict plan parsing.
- Modify `src/main/agent/registerAgentIpc.ts`: use shared mode-aware request validation before invoking the gateway.
- Create `src/renderer/src/components/AiPanel/aiPanelAgentPreferences.ts`: exception-safe execution-mode and approval-mode persistence.
- Create `src/renderer/src/components/AiPanel/agentApprovalPolicy.ts`: pure risk/approval matrix.
- Modify `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorHistory.ts`: monotonic editor revision owned outside project data.
- Modify `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorAgentApi.ts`: expose revision while retaining the existing transaction boundary.
- Modify `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/VideoEditorWorkspace.tsx`: wire history revision into the registered Agent API.
- Create `src/renderer/src/components/AiPanel/agentEditorPlanExecutor.ts`: compile plan actions against a simulated project and commit once.
- Modify `src/renderer/src/components/AiPanel/agentChatTools.ts`: structured read/plan execution results and defense-in-depth mode checks.
- Modify `src/renderer/src/components/AiPanel/AiPanel.tsx`: persisted controls, pending-plan state machine, approve/reject/resume flow.
- Modify `src/renderer/src/components/AiPanel/AiPanel.css`: permission menu and in-conversation approval block.
- Modify current contracts and verification documentation after behavior is verified.

### Task 1: Shared structured chat and plan contract

**Files:**
- Modify: `src/shared/agent/workflow.ts:93-116`
- Create: `src/shared/agent/chatContract.ts`
- Create: `tests/agent-chat-contract.test.ts`

- [ ] **Step 1: Write failing contract tests**

Create tests that import the not-yet-existing validators and cover every action variant, unknown keys, non-finite numbers, overlong plans, mode mismatch, and structured result codes:

```ts
import { describe, expect, it } from 'vitest'
import {
  isAgentChatRequest,
  parseAgentToolCall
} from '../src/shared/agent/chatContract'

describe('Agent chat shared contract', () => {
  const plan = {
    planId: 'plan-1',
    projectRevision: 4,
    summary: '整理两个片段',
    actions: [
      { type: 'clip.move', clipId: 'clip-1', timelineStart: 2 },
      { type: 'clip.update', clipId: 'clip-2', patch: { volume: 0.8 } }
    ]
  }

  it('accepts an Agent plan containing only strict action variants', () => {
    expect(parseAgentToolCall('agent', {
      id: 'call-1',
      name: 'propose_editor_plan',
      arguments: plan
    })).toEqual({ id: 'call-1', name: 'propose_editor_plan', arguments: plan })
  })

  it('rejects modification tools in Assistant mode', () => {
    expect(() => parseAgentToolCall('assistant', {
      id: 'call-1',
      name: 'propose_editor_plan',
      arguments: plan
    })).toThrow('助手模式不允许修改工具')
  })

  it.each([
    { ...plan, extra: true },
    { ...plan, projectRevision: -1 },
    { ...plan, actions: [{ type: 'clip.move', clipId: 'clip-1', timelineStart: Number.NaN }] },
    { ...plan, actions: [{ type: 'clip.update', clipId: 'clip-1', patch: { arbitrary: 1 } }] },
    { ...plan, actions: Array.from({ length: 21 }, (_, index) => ({ type: 'clip.delete', clipIds: [`clip-${index}`] })) }
  ])('rejects invalid plan %#', (invalidPlan) => {
    expect(() => parseAgentToolCall('agent', {
      id: 'call-1', name: 'propose_editor_plan', arguments: invalidPlan
    })).toThrow()
  })

  it('requires mode and approval mode in every request', () => {
    expect(isAgentChatRequest({
      configId: 'config-1',
      mode: 'agent',
      approvalMode: 'request',
      messages: [{ role: 'user', content: '整理时间线' }]
    })).toBe(true)
    expect(isAgentChatRequest({
      configId: 'config-1', messages: [{ role: 'user', content: '整理时间线' }]
    })).toBe(false)
  })
})
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```powershell
npm test -- tests/agent-chat-contract.test.ts
```

Expected: FAIL because `chatContract.ts`, chat modes, plan actions, and result codes do not exist.

- [ ] **Step 3: Add exact serializable types**

Add the final mode, approval, plan, and result types in `workflow.ts`:

```ts
export type AgentChatMode = 'agent' | 'assistant'
export type AgentApprovalMode = 'request' | 'smart' | 'full'

export type AgentEditorPlanAction =
  | { type: 'clip.delete'; clipIds: string[]; magnetMainTrack?: boolean }
  | { type: 'clip.split'; clipId: string; at: number }
  | { type: 'clip.move'; clipId: string; timelineStart: number; trackId?: string }
  | {
      type: 'clip.update'
      clipId: string
      patch: {
        opacity?: number
        volume?: number
        muted?: boolean
        speed?: number
        enabled?: boolean
        transform?: {
          x?: number
          y?: number
          scaleX?: number
          scaleY?: number
          rotation?: number
        }
      }
    }

export interface AgentEditorPlan {
  planId: string
  projectRevision: number
  summary: string
  actions: AgentEditorPlanAction[]
}

export type AgentToolCall =
  | { id: string; name: 'get_editor_context'; arguments: Record<string, never> }
  | { id: string; name: 'propose_editor_plan'; arguments: AgentEditorPlan }

export type AgentToolResultCode =
  | 'OK'
  | 'AWAITING_APPROVAL'
  | 'REJECTED'
  | 'STALE_CONTEXT'
  | 'INVALID_PLAN'
  | 'UNSUPPORTED_ACTION'
  | 'EDITOR_UNAVAILABLE'
  | 'EXECUTION_FAILED'

export interface AgentToolExecutionResult {
  success: boolean
  code: AgentToolResultCode
  message: string
  changed: boolean
  affectedClipIds: string[]
  data?: unknown
}

export interface AgentChatRequest {
  configId: string
  mode: AgentChatMode
  approvalMode: AgentApprovalMode
  messages: AgentChatMessage[]
}
```

For this first commit only, keep the existing `delete_selected_clips` and `split_selected_clip` variants in the `AgentToolCall` union alongside the two new variants so current Main/Renderer consumers still compile. `parseAgentToolCall` must never accept those legacy variants. Task 2 removes the legacy variants and implementations after all consumers migrate to `propose_editor_plan`.

- [ ] **Step 4: Implement strict shared validators**

In `chatContract.ts`, export `isAgentChatRequest(value)`, `parseAgentToolCall(mode, value)`, and `isAgentToolExecutionResult(value)`. Use exact-key checks, `Number.isFinite`, limits of 20 actions, 100 affected clip IDs, 200 characters for IDs, 2,000 characters for summaries, 60 messages, and 20,000 characters per message. `parseAgentToolCall` must throw for unknown tools, unknown object fields, invalid action fields, empty actions, or `propose_editor_plan` in Assistant mode.

The action parser must construct a fresh normalized object rather than returning the original untrusted object. Clamp nothing: invalid numeric ranges fail. Use these ranges: timeline/split time `0..86_400`, opacity/volume `0..1`, speed `0.1..8`, transform x/y `-100_000..100_000`, scale `0.01..100`, rotation `-36_000..36_000`.

- [ ] **Step 5: Add required request defaults to current consumers**

Before changing the UI controls in Task 6, update the current `AiPanel` request to send the safe fixed values:

```ts
const response = await chatApi({
  configId: selectedConfigId,
  mode: 'agent',
  approvalMode: 'request',
  messages: conversation
})
```

Update existing `runAgentChat` expectations and IPC request fixtures to include these two fields. This step is only a compile-safe bridge; it does not claim the static controls are functional.

- [ ] **Step 6: Run the contract test and full typecheck**

```powershell
npm test -- tests/agent-chat-contract.test.ts
npm run typecheck
```

Expected: contract tests and typecheck PASS. Legacy direct-edit tool variants remain temporarily typed but cannot pass the new shared parser.

- [ ] **Step 7: Commit the shared contract and compile-safe request migration**

```powershell
git add -- src/shared/agent/workflow.ts src/shared/agent/chatContract.ts src/renderer/src/components/AiPanel/AiPanel.tsx tests/agent-chat-contract.test.ts tests/ai-panel.test.tsx tests/agent-model-ipc.test.ts
git commit -m "feat: define structured Agent plan contract"
```

### Task 2: Mode-specific Main tools and IPC validation

**Files:**
- Modify: `src/main/agent/runtime/ModelGateway.ts:32-195`
- Modify: `src/main/agent/registerAgentIpc.ts:125-194`
- Modify: `tests/agent-chat.test.ts`
- Modify: `tests/agent-model-ipc.test.ts`
- Modify: `tests/agent-ipc-contract.test.ts`

- [ ] **Step 1: Write failing Main behavior tests**

Update gateway tests to call `chat(configId, messages, mode, approvalMode)` and assert:

```ts
it('exposes only the read tool in Assistant mode', async () => {
  const { gateway, fetchMock } = createGatewayReturningText('工程有 3 个片段')
  await gateway.chat('config-1', [{ role: 'user', content: '工程里有什么？' }], 'assistant', 'full')
  const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
  expect(body.tools.map((tool: { function: { name: string } }) => tool.function.name))
    .toEqual(['get_editor_context'])
})

it('exposes read and plan tools in Agent mode', async () => {
  const { gateway, fetchMock } = createGatewayReturningText('准备规划')
  await gateway.chat('config-1', [{ role: 'user', content: '整理时间线' }], 'agent', 'request')
  const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
  expect(body.tools.map((tool: { function: { name: string } }) => tool.function.name))
    .toEqual(['get_editor_context', 'propose_editor_plan'])
})
```

Add tests for a valid parsed plan, Assistant-mode forged plan rejection, unknown fields, old `delete_selected_clips` rejection, and IPC requests missing mode/approval mode.

- [ ] **Step 2: Run focused Main tests and verify RED**

```powershell
npm test -- tests/agent-chat.test.ts tests/agent-model-ipc.test.ts tests/agent-ipc-contract.test.ts
```

Expected: FAIL because the gateway still declares direct edit tools and IPC uses the old request validator/signature.

- [ ] **Step 3: Replace direct edit tools with mode-specific definitions**

Keep one `GET_EDITOR_CONTEXT_TOOL`. Add `PROPOSE_EDITOR_PLAN_TOOL` whose JSON Schema uses `oneOf` for the four strict action variants, `additionalProperties: false` at every object level, and `minItems: 1`, `maxItems: 20` for actions. Build tools as:

```ts
function chatTools(mode: AgentChatMode): readonly Record<string, unknown>[] {
  return mode === 'assistant'
    ? [GET_EDITOR_CONTEXT_TOOL]
    : [GET_EDITOR_CONTEXT_TOOL, PROPOSE_EDITOR_PLAN_TOOL]
}
```

Use separate system prompts. Assistant prompt must say it cannot modify the project. Agent prompt must require reading revision before planning and must use `propose_editor_plan` for all changes. Approval mode may be described to the model for UX, but Renderer remains authoritative.

- [ ] **Step 4: Parse model tool calls through the shared validator**

Change `parseToolCalls(message, mode)` to parse JSON and call `parseAgentToolCall(mode, { id, name, arguments })`. Do not silently drop an unknown or forbidden model tool; throw a deterministic error so the model cannot claim the operation occurred.

Change the gateway signature:

```ts
async chat(
  configId: string,
  messages: AgentChatMessage[],
  mode: AgentChatMode,
  approvalMode: AgentApprovalMode
): Promise<AgentChatAssistantMessage>
```

Remove the temporary `delete_selected_clips` and `split_selected_clip` variants from `AgentToolCall` after ModelGateway, Renderer fixtures, and chat history are migrated. No direct-edit tool name may remain in the final request validator or model tool list.

- [ ] **Step 5: Use the shared mode-aware IPC request validator**

Delete the duplicate chat/tool validation functions from `registerAgentIpc.ts`, import `isAgentChatRequest`, and invoke:

```ts
assistant: await services.gateway.chat(
  request.configId,
  request.messages,
  request.mode,
  request.approvalMode
)
```

Preload method signatures do not change because they already use `AgentChatRequest`.

- [ ] **Step 6: Verify Main behavior and commit**

```powershell
npm test -- tests/agent-chat-contract.test.ts tests/agent-chat.test.ts tests/agent-model-ipc.test.ts tests/agent-ipc-contract.test.ts
npm run typecheck:node
git add -- src/main/agent/runtime/ModelGateway.ts src/main/agent/registerAgentIpc.ts tests/agent-chat.test.ts tests/agent-model-ipc.test.ts tests/agent-ipc-contract.test.ts
git commit -m "feat: isolate Assistant and Agent model tools"
```

Expected: focused tests and Node typecheck PASS.

### Task 3: Persisted mode preferences and approval policy

**Files:**
- Create: `src/renderer/src/components/AiPanel/aiPanelAgentPreferences.ts`
- Create: `src/renderer/src/components/AiPanel/agentApprovalPolicy.ts`
- Create: `tests/ai-panel-agent-preferences.test.ts`
- Create: `tests/agent-approval-policy.test.ts`

- [ ] **Step 1: Write failing preference and policy tests**

```ts
import { describe, expect, it } from 'vitest'
import { decideAgentPlanApproval } from '../src/renderer/src/components/AiPanel/agentApprovalPolicy'

const singleMove = {
  planId: 'plan-1', projectRevision: 1, summary: '移动片段',
  actions: [{ type: 'clip.move' as const, clipId: 'clip-1', timelineStart: 2 }]
}

describe('Agent approval policy', () => {
  it('rejects every modification plan in Assistant mode', () => {
    expect(decideAgentPlanApproval('assistant', 'full', singleMove)).toBe('reject')
  })

  it('requires approval for all plans in request mode', () => {
    expect(decideAgentPlanApproval('agent', 'request', singleMove)).toBe('require_approval')
  })

  it('auto executes only one smart low-risk action', () => {
    expect(decideAgentPlanApproval('agent', 'smart', singleMove)).toBe('auto_execute')
    expect(decideAgentPlanApproval('agent', 'smart', {
      ...singleMove,
      actions: [{ type: 'clip.delete', clipIds: ['clip-1'] }]
    })).toBe('require_approval')
    expect(decideAgentPlanApproval('agent', 'smart', {
      ...singleMove,
      actions: [singleMove.actions[0], { ...singleMove.actions[0], clipId: 'clip-2' }]
    })).toBe('require_approval')
  })

  it('auto executes all allowlisted plans in full mode', () => {
    expect(decideAgentPlanApproval('agent', 'full', {
      ...singleMove,
      actions: [{ type: 'clip.delete', clipIds: ['clip-1'] }]
    })).toBe('auto_execute')
  })
})
```

Preference tests must verify defaults `agent/request`, round-trip persistence, invalid stored values falling back safely, Assistant mode not clearing the saved approval mode, and storage exceptions not throwing.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/ai-panel-agent-preferences.test.ts tests/agent-approval-policy.test.ts
```

Expected: FAIL because both modules are absent.

- [ ] **Step 3: Implement preferences and pure policy**

Use independent keys:

```ts
export const AI_EXECUTION_MODE_KEY = 'desktop-client.ai.execution-mode'
export const AI_APPROVAL_MODE_KEY = 'desktop-client.ai.approval-mode'
```

Export exception-safe `readAiExecutionMode`, `writeAiExecutionMode`, `readAiApprovalMode`, and `writeAiApprovalMode`. Invalid values return `agent` and `request`. The policy returns exactly `'auto_execute' | 'require_approval' | 'reject'`. In smart mode, only one `clip.split`, `clip.move`, or `clip.update` action auto-executes; all deletes and all plans with more than one action require approval.

- [ ] **Step 4: Verify and commit**

```powershell
npm test -- tests/ai-panel-agent-preferences.test.ts tests/agent-approval-policy.test.ts
npm run typecheck:web
git add -- src/renderer/src/components/AiPanel/aiPanelAgentPreferences.ts src/renderer/src/components/AiPanel/agentApprovalPolicy.ts tests/ai-panel-agent-preferences.test.ts tests/agent-approval-policy.test.ts
git commit -m "feat: add Agent approval preferences and policy"
```

### Task 4: Editor revision contract

**Files:**
- Modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorHistory.ts`
- Modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorAgentApi.ts`
- Modify: `src/renderer/src/components/SmartEdit/VideoEditorWorkspace/VideoEditorWorkspace.tsx`
- Modify: `tests/editor-v2-history.test.ts`
- Modify: `tests/editor-agent-api.test.ts`

- [ ] **Step 1: Add failing revision tests**

Extend history tests to assert initial revision `0`; successful command/transaction, Undo/Redo, aspect ratio, asset import/ready/failed increment it; selection/playhead/zoom, history clear, invalid command, and no-op project actions do not. Assert external-fact rebase still preserves Undo snapshots.

Extend Agent API tests:

```ts
const api = createEditorAgentApi({
  getProject: () => project,
  getRevision: () => 7,
  // existing dependencies
})
expect(api.getRevision()).toBe(7)
```

- [ ] **Step 2: Run history/API tests and verify RED**

```powershell
npm test -- tests/editor-v2-history.test.ts tests/editor-agent-api.test.ts
```

Expected: FAIL because history and API have no revision.

- [ ] **Step 3: Add revision to history state**

Add `revision: number` to `EditorHistoryState`. Increment only when `present` materially changes in these cases:

- successful `command/execute`, `command/batch`, `command/transaction`;
- successful Undo/Redo;
- every `project/action` except `timeline/clipSelected`, `timeline/playheadChanged`, and `timeline/zoomChanged`.

Keep revision monotonic across Undo/Redo; never restore it from a project snapshot. `history/clear` does not increment because the current project is unchanged.

- [ ] **Step 4: Expose revision through EditorAgentApi**

Add `getRevision: () => number` to both dependency and public interfaces and return it from `createEditorAgentApi`. In `VideoEditorWorkspace`, pass `getRevision: () => history.revision` and include `history.revision` in the Agent API memo dependencies.

- [ ] **Step 5: Verify focused Editor tests and commit**

```powershell
npm test -- tests/editor-v2-history.test.ts tests/editor-agent-api.test.ts tests/editor-v2-command.test.ts
npm run typecheck:web
git add -- src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorHistory.ts src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorAgentApi.ts src/renderer/src/components/SmartEdit/VideoEditorWorkspace/VideoEditorWorkspace.tsx tests/editor-v2-history.test.ts tests/editor-agent-api.test.ts
git commit -m "feat: expose monotonic editor revision"
```

### Task 5: Atomic plan compiler and structured tool results

**Files:**
- Create: `src/renderer/src/components/AiPanel/agentEditorPlanExecutor.ts`
- Modify: `src/renderer/src/components/AiPanel/agentChatTools.ts`
- Create: `tests/agent-editor-plan-executor.test.ts`
- Modify: `tests/editor-agent-api.test.ts`

- [ ] **Step 1: Write failing atomic execution tests**

Build a real project fixture with two ready clips and a real `EditorAgentApi`. Assert:

```ts
it('compiles several actions and submits one transaction', () => {
  const executeTransaction = vi.fn((commands) => applyEditorTransactionWithResult(project, commands))
  const result = executeAgentEditorPlan(planWithMoveAndUpdate, apiWithRevision(3, executeTransaction))
  expect(result).toMatchObject({ success: true, code: 'OK', changed: true })
  expect(executeTransaction).toHaveBeenCalledOnce()
  expect(executeTransaction.mock.calls[0][1]).toBe('AI：整理两个片段')
})

it('does not submit when a later action fails preflight', () => {
  const executeTransaction = vi.fn()
  const result = executeAgentEditorPlan(planWithValidMoveThenMissingClip, apiWithRevision(3, executeTransaction))
  expect(result).toMatchObject({ success: false, code: 'INVALID_PLAN', changed: false })
  expect(executeTransaction).not.toHaveBeenCalled()
})

it('rejects stale context before execution', () => {
  expect(executeAgentEditorPlan({ ...planWithMoveAndUpdate, projectRevision: 2 }, apiWithRevision(3)))
    .toMatchObject({ code: 'STALE_CONTEXT', changed: false })
})
```

Also test delete with magnet cleanup, split ID generation, move collision/locked-track failures, update range validation, affected clip IDs, and exactly one History Undo step after a successful multi-action plan.

- [ ] **Step 2: Run plan tests and verify RED**

```powershell
npm test -- tests/agent-editor-plan-executor.test.ts tests/editor-agent-api.test.ts
```

Expected: FAIL because no compiler or atomic API exists.

- [ ] **Step 3: Implement pure plan compilation**

Export:

```ts
export interface CompiledAgentEditorPlan {
  commands: EditorCommand[]
  affectedClipIds: string[]
}

export function compileAgentEditorPlan(
  project: EditorProjectState,
  plan: AgentEditorPlan,
  ids: Pick<EditorIdFactory, 'clip'> = createDefaultEditorIdFactory()
): { success: true; compiled: CompiledAgentEditorPlan } | { success: false; message: string }
```

Simulate actions in order with `applyEditorTransactionWithResult`. Use `planMoveClips` and `planDeleteClips`; create strict `clip/update` commands; create split commands with Renderer-generated `rightClipId`. If any action has no target, no commands, or fails simulation, return failure with no executable commands. Deduplicate affected IDs while preserving first occurrence.

- [ ] **Step 4: Add one atomic execution function without reversing dependencies**

Export from `agentEditorPlanExecutor.ts`:

```ts
export function executeAgentEditorPlan(
  plan: AgentEditorPlan,
  editorApi: EditorAgentApi
): AgentToolExecutionResult
```

The executor calls `editorApi.getProjectSnapshot()`, `editorApi.getRevision()`, and the existing `editorApi.executeTransaction()`. `editorAgentApi.ts` must not import anything from `AiPanel`; dependency direction remains `AiPanel -> EditorAgentApi`.

Return `AgentToolExecutionResult`. Recheck revision immediately before `executeTransaction`. Map transaction failures to `EXECUTION_FAILED`; stale revision to `STALE_CONTEXT`; compilation failures to `INVALID_PLAN` or `UNSUPPORTED_ACTION`.

- [ ] **Step 5: Restrict chat tool execution**

Update `executeAgentToolCall(call, editorApi, mode)`:

- `get_editor_context` returns `code: 'OK'`, `changed: false`, `affectedClipIds: []`, and includes `revision` in `data`;
- Assistant mode returns `UNSUPPORTED_ACTION` for a forged plan;
- `propose_editor_plan` is not executed directly by this helper until the approval policy authorizes it; export `executeApprovedAgentPlan(plan, editorApi)` for the approved/auto path.

Remove the old selection-based delete/split execution branches and labels.

- [ ] **Step 6: Verify atomic behavior and commit**

```powershell
npm test -- tests/agent-editor-plan-executor.test.ts tests/editor-agent-api.test.ts tests/editor-v2-history.test.ts
npm run typecheck:web
git add -- src/renderer/src/components/AiPanel/agentEditorPlanExecutor.ts src/renderer/src/components/AiPanel/agentChatTools.ts tests/agent-editor-plan-executor.test.ts tests/editor-agent-api.test.ts
git commit -m "feat: execute Agent plans as one editor transaction"
```

### Task 6: AI panel approval state machine and permission UI

**Files:**
- Modify: `src/renderer/src/components/AiPanel/AiPanel.tsx`
- Modify: `src/renderer/src/components/AiPanel/AiPanel.css`
- Modify: `tests/ai-panel.test.tsx`

- [ ] **Step 1: Write failing mounted behavior tests**

Add tests for:

- default `Agent + 请求批准` and persistence across remount;
- `助手` label replacing `Ask`, approval menu disabled in Assistant mode, and saved Agent approval retained;
- chat requests include `mode` and `approvalMode`;
- Assistant mode never executes a forged `propose_editor_plan`;
- request mode renders a plan approval block without executing;
- approve rechecks revision, executes once, adds structured tool history, and resumes the model round;
- reject adds `REJECTED`, does not execute, and resumes for a final explanation;
- smart single move auto-executes; smart delete and multi-action wait;
- full mode auto-executes delete;
- a revision change while waiting yields `STALE_CONTEXT` and no execution;
- pending/executing state disables send, mode, approval controls, and new competing plans;
- new-conversation clears a pending plan as rejected without editing the project.

Use the real policy module and a narrow registered `EditorAgentApi` fake; mock only `window.api.runAgentChat` and model configuration loading.

- [ ] **Step 2: Run AiPanel tests and verify RED**

```powershell
npm test -- tests/ai-panel.test.tsx
```

Expected: FAIL because controls are uncontrolled static selects and the panel immediately executes every tool call.

- [ ] **Step 3: Add controlled persisted mode state**

Initialize:

```ts
const [executionMode, setExecutionMode] = useState<AgentChatMode>(() => readAiExecutionMode())
const [approvalMode, setApprovalMode] = useState<AgentApprovalMode>(() => readAiApprovalMode())
```

Persist changes immediately. Send both fields with every `runAgentChat` request. Keep existing model preference independent.

- [ ] **Step 4: Implement pending-plan state and resume flow**

Add one pending structure containing `tab`, tool call, conversation through the assistant plan message, and plan. When a plan arrives:

1. call `decideAgentPlanApproval`;
2. reject immediately if mode forbids it;
3. execute and append a tool result for `auto_execute`;
4. set pending state and return from `runChat` for `require_approval`.

Extract `continueAfterToolResult(pending, result)` so approve, reject, stale, and automatic execution all append the same structured tool message and resume `runChat`. Do not recursively retain `isSending=true` across the approval wait; waiting is a separate state.

- [ ] **Step 5: Render the approval block**

Extend conversation messages with a plan item containing plan ID, summary, action labels, state, and two commands. Render inside the message stream:

```tsx
<section className="studio-ai-panel__approval" aria-label={`审批计划 ${plan.summary}`}>
  <div>
    <ShieldCheck aria-hidden="true" />
    <strong>{plan.summary}</strong>
  </div>
  <ul>{plan.actions.map(renderActionSummary)}</ul>
  <div className="studio-ai-panel__approval-actions">
    <button type="button" onClick={approvePendingPlan}>批准执行</button>
    <button type="button" onClick={rejectPendingPlan}>拒绝</button>
  </div>
</section>
```

On approval, compare `getActiveEditorAgentApi()?.getRevision()` before calling the executor. If stale, render the stale state and return a `STALE_CONTEXT` tool result.

- [ ] **Step 6: Replace the static approval select with a described menu**

Use a semantic button with `aria-haspopup="menu"`, a compact popover, three `menuitemradio` buttons, Lucide icons, descriptions, and a `Check` on the selected item. Labels/descriptions:

- `请求批准` / `修改工程前始终询问`
- `智能审批` / `仅对删除、批量和覆盖操作询问`
- `完全访问` / `自动执行已注册的编辑操作`

Cards/menu radius must remain at or below 8px, text must wrap, and no nested cards are added. Disable the approval trigger in Assistant mode and show its last saved selection without changing storage.

- [ ] **Step 7: Verify mounted behavior, styles, and commit**

```powershell
npm test -- tests/ai-panel.test.tsx tests/agent-approval-policy.test.ts tests/ai-panel-agent-preferences.test.ts tests/agent-editor-plan-executor.test.ts
npm run typecheck:web
npx eslint src/renderer/src/components/AiPanel/AiPanel.tsx src/renderer/src/components/AiPanel/aiPanelAgentPreferences.ts src/renderer/src/components/AiPanel/agentApprovalPolicy.ts src/renderer/src/components/AiPanel/agentEditorPlanExecutor.ts tests/ai-panel.test.tsx
git add -- src/renderer/src/components/AiPanel/AiPanel.tsx src/renderer/src/components/AiPanel/AiPanel.css tests/ai-panel.test.tsx
git commit -m "feat: add Agent approval workflow to AI panel"
```

Expected: all focused tests and Web typecheck PASS; ESLint exits `0` with no errors in touched files.

### Task 7: Current contracts and complete verification

**Files:**
- Modify: `docs/contracts/electron-ipc.md`
- Modify: `docs/contracts/editor-v2.md`
- Modify: `docs/architecture/current.md`
- Modify: `docs/verification.md`

- [ ] **Step 1: Update current contracts from implemented behavior**

Document:

- `runAgentChat` requires execution/approval mode but uses the existing IPC channel;
- Assistant exposes read-only context; Agent exposes read and structured planning;
- Main validation and Renderer approval are separate defenses;
- editor revision ownership and invalidation events;
- atomic plan compilation through Placement Policy and one transaction/Undo Step;
- approval preferences are Renderer-only non-sensitive `localStorage` values;
- completely authorized mode still cannot access arbitrary IPC/files/network/code.

Do not describe streaming, request cancellation, conversation persistence, or future tools as implemented.

- [ ] **Step 2: Run the complete test suite**

```powershell
npm test -- --reporter=dot
```

Expected: exit `0`; record exact file/test counts, four known jsdom media notices, and the expected catalog fallback warning.

- [ ] **Step 3: Run full static verification**

```powershell
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: every command exits `0`; lint has zero errors. Record exact warnings without calling warning output clean.

- [ ] **Step 4: Refresh verification evidence**

Update `docs/verification.md` with date `2026-08-13`, exact test counts, typecheck/build results, lint error/warning counts, and known test notices from Step 2.

- [ ] **Step 5: Commit current documentation**

```powershell
git add -- docs/contracts/electron-ipc.md docs/contracts/editor-v2.md docs/architecture/current.md docs/verification.md
git commit -m "docs: record Agent approval contracts"
```

- [ ] **Step 6: Review final scope**

```powershell
git status --short --branch
git diff 13abb2a...HEAD --stat
git diff --check 13abb2a...HEAD
```

Expected: clean feature worktree; only plan, shared/Main/Renderer/editor/test files and the four current docs are changed. Do not push or merge until the user chooses a completion option.
