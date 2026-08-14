import {
  AlertCircle,
  CheckCircle2,
  CircleStop,
  FileAudio,
  FileText,
  Film,
  FolderOpen,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Save,
  Trash2,
  Upload
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type JSX } from 'react'

import {
  buildOutputName,
  createDefaultNovelProject,
  loadNovelProject,
  saveNovelProject,
  validateNovelProject
} from './novelPromotionStorage'
import type {
  NovelAudioItem,
  NovelGenerationJob,
  NovelPromotionProject
} from './novelPromotionTypes'
import './NovelPromotion.css'

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg']
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v']
const RUN_PHASES = [
  '替换视频素材',
  '替换小说音频',
  '音频识别字幕',
  '替换字幕时间轴',
  '替换小说口令',
  '等待剪映导出'
]

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ''
}

function getFolderName(file: File): string {
  const relativePath = file.webkitRelativePath
  return relativePath ? relativePath.split('/')[0] : file.name
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) {
    return '自动读取'
  }

  const totalSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(totalSeconds / 60)
  const restSeconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(restSeconds).padStart(2, '0')}`
}

function readAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio')
    const objectUrl = URL.createObjectURL(file)
    const finish = (duration: number | null): void => {
      URL.revokeObjectURL(objectUrl)
      audio.remove()
      resolve(duration)
    }

    audio.preload = 'metadata'
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : null)
    audio.onerror = () => finish(null)
    audio.src = objectUrl
  })
}

function parseCommands(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function buildJobs(project: NovelPromotionProject): NovelGenerationJob[] {
  return project.audioItems.map((audio, index) => ({
    id: audio.id,
    index,
    audioName: audio.fileName,
    command: project.commands[index] ?? '',
    durationSeconds: audio.durationSeconds,
    outputName: buildOutputName(project, index),
    status: 'waiting',
    phase: '等待生成'
  }))
}

function NovelPromotionView(): JSX.Element {
  const [project, setProject] = useState<NovelPromotionProject>(() => loadNovelProject())
  const [jobs, setJobs] = useState<NovelGenerationJob[]>([])
  const [commandText, setCommandText] = useState(() => loadNovelProject().commands.join('\n'))
  const [toast, setToast] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const runTimerRef = useRef<number | null>(null)
  const runCursorRef = useRef({ jobIndex: 0, phaseIndex: 0 })

  const draftInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const commandInputRef = useRef<HTMLInputElement>(null)
  const materialInputRef = useRef<HTMLInputElement>(null)

  const validation = useMemo(() => validateNovelProject(project), [project])
  const completedCount = jobs.filter((job) => job.status === 'success').length
  const failedCount = jobs.filter((job) => job.status === 'failed').length

  useEffect(() => {
    const directoryInputs = [draftInputRef.current, audioInputRef.current, materialInputRef.current]
    directoryInputs.forEach((input) => {
      input?.setAttribute('webkitdirectory', '')
      input?.setAttribute('directory', '')
      input?.setAttribute('multiple', '')
    })
  }, [])

  useEffect(() => {
    const nextProject = { ...project, updatedAt: new Date().toISOString() }
    saveNovelProject(nextProject)
  }, [project])

  useEffect(() => {
    if (!toast) {
      return undefined
    }

    const timer = window.setTimeout(() => setToast(''), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    return () => {
      if (runTimerRef.current !== null) {
        window.clearInterval(runTimerRef.current)
      }
    }
  }, [])

  const updateProject = <K extends keyof NovelPromotionProject>(
    key: K,
    value: NovelPromotionProject[K]
  ): void => {
    setProject((current) => ({ ...current, [key]: value }))
  }

  const handleDraftFolderSelected = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) {
      return
    }

    const draftContent = files.find((file) => file.name === 'draft_content.json')
    const relativeParts = draftContent?.webkitRelativePath.split('/') ?? []
    const detectedName =
      relativeParts.length >= 2 ? relativeParts[relativeParts.length - 2] : getFolderName(files[0])

    setProject((current) => ({
      ...current,
      draftFolder: getFolderName(files[0]),
      draftName: detectedName,
      draftDetected: Boolean(draftContent)
    }))
    setToast(draftContent ? '已识别剪映草稿结构' : '已选择文件夹，未检测到 draft_content.json')
    event.target.value = ''
  }

  const handleAudioFolderSelected = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const allFiles = Array.from(event.target.files ?? [])
    const audioFiles = allFiles
      .filter((file) => AUDIO_EXTENSIONS.includes(getExtension(file.name)))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN', { numeric: true }))

    if (audioFiles.length === 0) {
      setToast('该文件夹里没有找到支持的音频文件')
      event.target.value = ''
      return
    }

    const audioItems: NovelAudioItem[] = await Promise.all(
      audioFiles.map(async (file) => ({
        id: createId(),
        fileName: file.name,
        fileSize: file.size,
        durationSeconds: await readAudioDuration(file)
      }))
    )

    setProject((current) => ({
      ...current,
      audioFolder: getFolderName(audioFiles[0]),
      audioItems,
      commands: []
    }))
    setCommandText('')
    setJobs([])
    setToast(`已导入 ${audioItems.length} 个音频`)
    event.target.value = ''
  }

  const applyCommands = (commands: string[]): void => {
    setProject((current) => ({ ...current, commands }))
    setCommandText(commands.join('\n'))
    setJobs([])
    setToast(`已导入 ${commands.length} 个口令`)
  }

  const handleCommandFileSelected = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    applyCommands(parseCommands(await file.text()))
    event.target.value = ''
  }

  const handleMaterialFolderSelected = (event: ChangeEvent<HTMLInputElement>): void => {
    const allFiles = Array.from(event.target.files ?? [])
    const videoFiles = allFiles.filter((file) => VIDEO_EXTENSIONS.includes(getExtension(file.name)))

    if (videoFiles.length === 0) {
      setToast('该文件夹里没有找到支持的视频素材')
      event.target.value = ''
      return
    }

    setProject((current) => ({
      ...current,
      materialFolder: getFolderName(videoFiles[0]),
      materialCount: videoFiles.length
    }))
    setToast(`已读取 ${videoFiles.length} 个视频素材`)
    event.target.value = ''
  }

  const handleCommandChange = (index: number, value: string): void => {
    const nextCommands = [...project.commands]
    while (nextCommands.length <= index) {
      nextCommands.push('')
    }
    nextCommands[index] = value
    setProject((current) => ({ ...current, commands: nextCommands }))
    setCommandText(nextCommands.join('\n'))
    setJobs([])
  }

  const removeAudio = (audioId: string): void => {
    const audioIndex = project.audioItems.findIndex((item) => item.id === audioId)
    if (audioIndex < 0) {
      return
    }

    const nextAudioItems = project.audioItems.filter((item) => item.id !== audioId)
    const nextCommands = project.commands.filter((_, index) => index !== audioIndex)
    setProject((current) => ({
      ...current,
      audioItems: nextAudioItems,
      commands: nextCommands
    }))
    setCommandText(nextCommands.join('\n'))
    setJobs([])
  }

  const stopTimer = (): void => {
    if (runTimerRef.current !== null) {
      window.clearInterval(runTimerRef.current)
      runTimerRef.current = null
    }
  }

  const tickRun = (): void => {
    const cursor = runCursorRef.current
    const currentJobs = buildJobs(project)

    setJobs((existingJobs) => {
      const nextJobs = existingJobs.length > 0 ? [...existingJobs] : currentJobs
      const job = nextJobs[cursor.jobIndex]

      if (!job) {
        stopTimer()
        setIsRunning(false)
        setIsPaused(false)
        setToast('批量任务演示已完成')
        return nextJobs
      }

      job.status = 'running'
      job.phase = RUN_PHASES[cursor.phaseIndex]

      if (cursor.phaseIndex >= RUN_PHASES.length - 1) {
        job.status = 'success'
        job.phase = '生成成功'
        cursor.jobIndex += 1
        cursor.phaseIndex = 0
      } else {
        cursor.phaseIndex += 1
      }

      return nextJobs
    })
  }

  const startRun = (): void => {
    if (!validation.canStart) {
      setToast('还有必填内容没有完成')
      return
    }

    stopTimer()
    const nextJobs = buildJobs(project)
    setJobs(nextJobs)
    runCursorRef.current = { jobIndex: 0, phaseIndex: 0 }
    setIsRunning(true)
    setIsPaused(false)
    runTimerRef.current = window.setInterval(tickRun, 650)
    setToast('已开始任务流程演示')
  }

  const togglePause = (): void => {
    if (!isRunning) {
      return
    }

    if (isPaused) {
      runTimerRef.current = window.setInterval(tickRun, 650)
      setIsPaused(false)
    } else {
      stopTimer()
      setIsPaused(true)
    }
  }

  const stopRun = (): void => {
    stopTimer()
    setIsRunning(false)
    setIsPaused(false)
    setJobs((current) =>
      current.map((job) =>
        job.status === 'running' ? { ...job, status: 'failed', phase: '任务已停止' } : job
      )
    )
  }

  const clearTask = (): void => {
    stopRun()
    const emptyProject = createDefaultNovelProject()
    setProject(emptyProject)
    setCommandText('')
    setJobs([])
    setToast('任务已清空')
  }

  const taskRows = jobs.length > 0 ? jobs : buildJobs(project)
  const commandDifference = project.commands.length - project.audioItems.length

  return (
    <section className="novel-page" aria-label="小说推文批量生成">
      {toast && <div className="novel-toast">{toast}</div>}

      <input
        ref={draftInputRef}
        className="novel-hidden-input"
        type="file"
        onChange={handleDraftFolderSelected}
      />
      <input
        ref={audioInputRef}
        className="novel-hidden-input"
        type="file"
        onChange={(event) => void handleAudioFolderSelected(event)}
      />
      <input
        ref={commandInputRef}
        className="novel-hidden-input"
        type="file"
        accept=".txt,text/plain"
        onChange={(event) => void handleCommandFileSelected(event)}
      />
      <input
        ref={materialInputRef}
        className="novel-hidden-input"
        type="file"
        onChange={handleMaterialFolderSelected}
      />

      <header className="novel-page__header">
        <div>
          <p className="novel-page__eyebrow">JIANYING 5.9 BATCH WORKFLOW</p>
          <input
            className="novel-task-name"
            value={project.taskName}
            onChange={(event) => updateProject('taskName', event.target.value)}
            aria-label="任务名称"
          />
          <p className="novel-page__subtitle">
            使用同一个剪映草稿，循环替换音频、字幕、口令和视频素材。
          </p>
        </div>
        <div className="novel-page__header-actions">
          <span className="novel-saved-time">
            <Save size={13} strokeWidth={1.8} aria-hidden="true" />
            自动保存
          </span>
          <button className="novel-button" type="button" onClick={clearTask} disabled={isRunning}>
            <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
            清空任务
          </button>
          <button
            className="novel-button novel-button--primary"
            type="button"
            onClick={startRun}
            disabled={!validation.canStart || isRunning}
          >
            <Play size={15} fill="currentColor" strokeWidth={1.8} aria-hidden="true" />
            开始批量生成
          </button>
        </div>
      </header>

      <div className="novel-page__content">
        <section className="novel-card novel-template-card">
          <div className="novel-card__header">
            <div className="novel-card__icon">
              <Film size={19} strokeWidth={1.8} />
            </div>
            <div>
              <h2>剪映5.9模板草稿</h2>
              <p>用户先在剪映里做好固定内容，软件只替换动态内容。</p>
            </div>
            <button
              className="novel-button"
              type="button"
              onClick={() => draftInputRef.current?.click()}
              disabled={isRunning}
            >
              <FolderOpen size={15} strokeWidth={1.8} aria-hidden="true" />
              选择草稿文件夹
            </button>
          </div>

          <div className="novel-template-grid">
            <label className="novel-field">
              <span>草稿文件夹</span>
              <input
                value={project.draftFolder}
                onChange={(event) => {
                  const draftFolder = event.target.value
                  setProject((current) => ({
                    ...current,
                    draftFolder,
                    draftDetected:
                      draftFolder === current.draftFolder ? current.draftDetected : false
                  }))
                }}
                placeholder="请选择剪映模板草稿所在文件夹"
              />
            </label>
            <label className="novel-field">
              <span>工作草稿</span>
              <input
                value={project.draftName}
                onChange={(event) => updateProject('draftName', event.target.value)}
                placeholder="例如：小说推文基础模板"
              />
            </label>
          </div>

          <div
            className={
              project.draftDetected ? 'novel-template-status is-ready' : 'novel-template-status'
            }
          >
            {project.draftDetected ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>
              {project.draftDetected
                ? '已检测到 draft_content.json，草稿结构可继续检查。'
                : '选择草稿文件夹后，页面会检测是否存在 draft_content.json。'}
            </span>
          </div>

          <div className="novel-fixed-content">
            <strong>草稿中这些内容保持不动：</strong>
            <span>APP名称</span>
            <span>APP图标</span>
            <span>引导话术</span>
            <span>字幕样式</span>
            <span>贴纸和固定画面</span>
          </div>
        </section>

        <section className="novel-card novel-task-card">
          <div className="novel-card__header">
            <div className="novel-card__icon">
              <FileAudio size={19} strokeWidth={1.8} />
            </div>
            <div>
              <h2>批量音频与小说口令</h2>
              <p>音频和口令按照列表顺序一一对应。</p>
            </div>
            <div className="novel-inline-actions">
              <button
                className="novel-button"
                type="button"
                onClick={() => audioInputRef.current?.click()}
                disabled={isRunning}
              >
                <Upload size={15} strokeWidth={1.8} />
                导入音频文件夹
              </button>
              <button
                className="novel-button"
                type="button"
                onClick={() => commandInputRef.current?.click()}
                disabled={isRunning}
              >
                <FileText size={15} strokeWidth={1.8} />
                导入口令TXT
              </button>
            </div>
          </div>

          <div className="novel-task-toolbar">
            <div>
              <span>
                音频：<strong>{project.audioItems.length}</strong> 个
              </span>
              <span>
                口令：<strong>{project.commands.length}</strong> 个
              </span>
              {commandDifference !== 0 && project.audioItems.length > 0 && (
                <span className="is-warning">
                  {commandDifference > 0
                    ? `多 ${commandDifference} 个口令`
                    : `少 ${Math.abs(commandDifference)} 个口令`}
                </span>
              )}
            </div>
            <label className="novel-checkbox novel-checkbox--locked">
              <input
                type="checkbox"
                checked={project.autoSubtitle}
                onChange={(event) => updateProject('autoSubtitle', event.target.checked)}
              />
              <span>根据每个音频自动生成字幕，并沿用草稿原字幕样式</span>
            </label>
          </div>

          <div className="novel-command-import">
            <label>
              <span>批量粘贴口令（一行一个）</span>
              <textarea
                value={commandText}
                onChange={(event) => setCommandText(event.target.value)}
                onBlur={() => applyCommands(parseCommands(commandText))}
                placeholder={'835729\n935821\n629183'}
                rows={3}
                disabled={isRunning}
              />
            </label>
            <button
              className="novel-button novel-button--secondary"
              type="button"
              onClick={() => applyCommands(parseCommands(commandText))}
              disabled={isRunning}
            >
              按顺序匹配
            </button>
          </div>

          <div className="novel-table-wrap">
            <table className="novel-task-table">
              <thead>
                <tr>
                  <th>序号</th>
                  <th>音频文件</th>
                  <th>时长</th>
                  <th>小说口令</th>
                  <th>输出文件</th>
                  <th>状态</th>
                  <th aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {taskRows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="novel-table-empty">
                        <FileAudio size={28} strokeWidth={1.5} />
                        <strong>还没有导入小说音频</strong>
                        <span>选择一个音频文件夹，软件会按文件名自动排序。</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  taskRows.map((row) => {
                    const audio = project.audioItems[row.index]
                    return (
                      <tr key={row.id}>
                        <td>{String(row.index + 1).padStart(2, '0')}</td>
                        <td>
                          <div className="novel-audio-name">
                            <FileAudio size={15} strokeWidth={1.8} />
                            <div>
                              <strong title={row.audioName}>{row.audioName}</strong>
                              <span>{audio ? formatFileSize(audio.fileSize) : ''}</span>
                            </div>
                          </div>
                        </td>
                        <td>{formatDuration(row.durationSeconds)}</td>
                        <td>
                          <input
                            className={
                              !row.command.trim()
                                ? 'novel-command-cell is-empty'
                                : 'novel-command-cell'
                            }
                            value={project.commands[row.index] ?? ''}
                            onChange={(event) => handleCommandChange(row.index, event.target.value)}
                            placeholder="填写口令"
                            disabled={isRunning}
                          />
                        </td>
                        <td className="novel-output-name" title={row.outputName}>
                          {row.outputName}
                        </td>
                        <td>
                          <span className={`novel-job-status is-${row.status}`}>
                            {row.status === 'running' && (
                              <LoaderCircle size={13} className="is-spinning" />
                            )}
                            {row.phase}
                          </span>
                        </td>
                        <td>
                          <button
                            className="novel-icon-button"
                            type="button"
                            aria-label={`删除${row.audioName}`}
                            onClick={() => removeAudio(row.id)}
                            disabled={isRunning}
                          >
                            <Trash2 size={15} strokeWidth={1.8} />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="novel-bottom-grid">
          <section className="novel-card">
            <div className="novel-card__header novel-card__header--compact">
              <div className="novel-card__icon">
                <Film size={19} strokeWidth={1.8} />
              </div>
              <div>
                <h2>随机视频素材</h2>
                <p>素材会按照音频时长自动铺满。</p>
              </div>
              <button
                className="novel-button"
                type="button"
                onClick={() => materialInputRef.current?.click()}
                disabled={isRunning}
              >
                <FolderOpen size={15} strokeWidth={1.8} />
                选择素材目录
              </button>
            </div>

            <label className="novel-field">
              <span>素材文件夹</span>
              <input
                value={project.materialFolder}
                onChange={(event) => {
                  const materialFolder = event.target.value
                  setProject((current) => ({
                    ...current,
                    materialFolder,
                    materialCount:
                      materialFolder === current.materialFolder ? current.materialCount : 0
                  }))
                }}
                placeholder="请选择视频素材文件夹"
              />
            </label>
            <div className="novel-material-count">
              已读取 <strong>{project.materialCount}</strong> 个视频素材
            </div>
            <div className="novel-option-grid">
              <label className="novel-checkbox">
                <input
                  type="checkbox"
                  checked={project.uniqueWithinVideo}
                  onChange={(event) => updateProject('uniqueWithinVideo', event.target.checked)}
                />
                <span>单条视频内不重复</span>
              </label>
              <label className="novel-checkbox">
                <input
                  type="checkbox"
                  checked={project.uniqueAcrossVideos}
                  onChange={(event) => updateProject('uniqueAcrossVideos', event.target.checked)}
                />
                <span>不同成品优先不重复</span>
              </label>
              <label className="novel-checkbox">
                <input
                  type="checkbox"
                  checked={project.allowMaterialReuse}
                  onChange={(event) => updateProject('allowMaterialReuse', event.target.checked)}
                />
                <span>素材不足后允许循环</span>
              </label>
              <label className="novel-small-field">
                <span>单段默认</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={project.materialSegmentSeconds}
                  onChange={(event) =>
                    updateProject(
                      'materialSegmentSeconds',
                      Math.max(1, Number(event.target.value) || 5)
                    )
                  }
                />
                <em>秒</em>
              </label>
            </div>
          </section>

          <section className="novel-card">
            <div className="novel-card__header novel-card__header--compact">
              <div className="novel-card__icon">
                <FolderOpen size={19} strokeWidth={1.8} />
              </div>
              <div>
                <h2>成品输出</h2>
                <p>每条视频导出完成后继续下一条。</p>
              </div>
            </div>

            <label className="novel-field">
              <span>输出目录</span>
              <input
                value={project.outputDirectory}
                onChange={(event) => updateProject('outputDirectory', event.target.value)}
                placeholder="例如：E:\\小说成品\\今日任务"
              />
            </label>
            <label className="novel-field">
              <span>文件名前缀（可选）</span>
              <input
                value={project.outputPrefix}
                onChange={(event) => updateProject('outputPrefix', event.target.value)}
                placeholder="例如：豪门复仇"
              />
            </label>
            <div className="novel-output-preview">
              <span>命名预览</span>
              <strong>{buildOutputName(project, 0)}</strong>
            </div>
          </section>
        </div>

        {(jobs.length > 0 || isRunning) && (
          <section className="novel-run-bar">
            <div className="novel-run-progress">
              <div>
                <strong>批量生成进度</strong>
                <span>
                  成功 {completedCount} / {jobs.length}，失败 {failedCount}
                </span>
              </div>
              <div className="novel-progress-track">
                <span
                  style={{
                    width: `${jobs.length ? ((completedCount + failedCount) / jobs.length) * 100 : 0}%`
                  }}
                />
              </div>
            </div>
            <div className="novel-inline-actions">
              <button
                className="novel-button"
                type="button"
                onClick={togglePause}
                disabled={!isRunning}
              >
                {isPaused ? <Play size={15} /> : <Pause size={15} />}
                {isPaused ? '继续' : '暂停'}
              </button>
              <button
                className="novel-button"
                type="button"
                onClick={stopRun}
                disabled={!isRunning && !isPaused}
              >
                <CircleStop size={15} />
                停止
              </button>
            </div>
          </section>
        )}
      </div>
    </section>
  )
}

export default NovelPromotionView
