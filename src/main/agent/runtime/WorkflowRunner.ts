import { randomUUID } from 'node:crypto'
import type {
  AgentActionResponse,
  AgentWorkflowProgress,
  NovelDecompressionRequest,
  StartAgentWorkflowResponse,
  WorkflowTaskSnapshot
} from '../../../shared/agent/workflow'
import { NovelDecompressionWorkflow } from '../workflows/NovelDecompressionWorkflow'

interface InternalTask {
  snapshot: WorkflowTaskSnapshot
  controller: AbortController
}

const MAX_RETAINED_TASKS = 20

export class WorkflowRunner {
  private readonly tasks = new Map<string, InternalTask>()

  constructor(private readonly workflow: NovelDecompressionWorkflow) {}

  startNovelDecompression(
    request: NovelDecompressionRequest,
    onProgress: (progress: AgentWorkflowProgress) => void
  ): StartAgentWorkflowResponse {
    const taskId = randomUUID()
    const now = Date.now()
    const task: InternalTask = {
      controller: new AbortController(),
      snapshot: {
        taskId,
        status: 'running',
        stage: 'queued',
        percent: 0,
        message: '任务已进入队列',
        createdAt: now,
        updatedAt: now
      }
    }
    this.tasks.set(taskId, task)
    this.pruneTasks()
    onProgress({ taskId, stage: 'queued', percent: 0, message: '任务已进入队列' })

    void this.workflow
      .run(request, {
        taskId,
        signal: task.controller.signal,
        emit: (progress) => {
          task.snapshot.stage = progress.stage
          task.snapshot.percent = progress.percent
          task.snapshot.message = progress.message
          task.snapshot.updatedAt = Date.now()
          onProgress({ taskId, ...progress })
        }
      })
      .then((result) => {
        if (task.controller.signal.aborted) {
          task.snapshot = {
            ...task.snapshot,
            status: 'cancelled',
            stage: 'cancelled',
            message: 'Agent task cancelled',
            error: undefined,
            updatedAt: Date.now()
          }
          onProgress({
            taskId,
            stage: 'cancelled',
            percent: task.snapshot.percent,
            message: task.snapshot.message
          })
          return
        }
        task.snapshot = {
          ...task.snapshot,
          status: 'completed',
          stage: 'completed',
          percent: 100,
          message: '任务完成',
          updatedAt: Date.now(),
          result
        }
        onProgress({ taskId, stage: 'completed', percent: 100, message: '任务完成' })
      })
      .catch((error: unknown) => {
        const cancelled = task.controller.signal.aborted
        task.snapshot = {
          ...task.snapshot,
          status: cancelled ? 'cancelled' : 'failed',
          stage: cancelled ? 'cancelled' : 'failed',
          message: cancelled
            ? '任务已取消'
            : error instanceof Error
              ? error.message
              : '任务执行失败',
          error: cancelled
            ? undefined
            : error instanceof Error
              ? error.stack || error.message
              : String(error),
          updatedAt: Date.now()
        }
        onProgress({
          taskId,
          stage: cancelled ? 'cancelled' : 'failed',
          percent: task.snapshot.percent,
          message: task.snapshot.message
        })
      })

    return { success: true, message: '任务已创建', taskId }
  }

  getTask(taskId: string): WorkflowTaskSnapshot | null {
    const task = this.tasks.get(taskId)
    return task ? structuredClone(task.snapshot) : null
  }

  private pruneTasks(): void {
    if (this.tasks.size <= MAX_RETAINED_TASKS) return
    const completed = [...this.tasks.entries()]
      .filter(([, task]) => task.snapshot.status !== 'running')
      .sort(([, first], [, second]) => first.snapshot.updatedAt - second.snapshot.updatedAt)
    while (this.tasks.size > MAX_RETAINED_TASKS && completed.length > 0) {
      const [taskId] = completed.shift()!
      this.tasks.delete(taskId)
    }
  }

  cancel(taskId: string): AgentActionResponse {
    const task = this.tasks.get(taskId)
    if (!task) return { success: false, message: '没有找到该 Agent 任务' }
    if (task.snapshot.status !== 'running') return { success: false, message: '任务已经结束' }
    task.controller.abort()
    return { success: true, message: '取消指令已发送' }
  }
}
