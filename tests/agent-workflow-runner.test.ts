import { describe, expect, it, vi } from 'vitest'
import { WorkflowRunner } from '../src/main/agent/runtime/WorkflowRunner'
import type { NovelDecompressionWorkflow } from '../src/main/agent/workflows/NovelDecompressionWorkflow'

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('WorkflowRunner', () => {
  it('reports a cancelled task after the workflow observes the abort signal', async () => {
    let rejectRun: ((reason: Error) => void) | undefined
    const workflow = {
      run: vi.fn((_request, context) => {
        return new Promise((_, reject) => {
          rejectRun = reject
          context.signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true
          })
        })
      })
    } as unknown as NovelDecompressionWorkflow
    const progress = vi.fn()
    const runner = new WorkflowRunner(workflow)

    const started = runner.startNovelDecompression({} as never, progress)
    expect(started.success).toBe(true)
    expect(started.taskId).toBeTruthy()
    expect(runner.getTask(started.taskId!)?.status).toBe('running')

    expect(runner.cancel(started.taskId!)).toMatchObject({ success: true })
    rejectRun?.(new Error('aborted'))
    await flushPromises()

    expect(runner.getTask(started.taskId!)).toMatchObject({
      status: 'cancelled',
      stage: 'cancelled'
    })
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'cancelled' }))
  })

  it('does not turn a late successful result into completed after cancellation', async () => {
    let resolveRun: ((result: never) => void) | undefined
    const workflow = {
      run: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveRun = resolve
          })
      )
    } as unknown as NovelDecompressionWorkflow
    const runner = new WorkflowRunner(workflow)
    const started = runner.startNovelDecompression({} as never, vi.fn())

    runner.cancel(started.taskId!)
    resolveRun?.({} as never)
    await flushPromises()

    expect(runner.getTask(started.taskId!)).toMatchObject({
      status: 'cancelled',
      stage: 'cancelled'
    })
  })
})
