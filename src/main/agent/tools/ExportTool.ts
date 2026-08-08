import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { EditingPlan } from '../../../shared/agent/editingPlan'

function run(command: string, args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk: Uint8Array | string) => (stderr += String(chunk)))
    child.on('error', reject)
    child.on('close', (code: number | null) => {
      if (code === 0) resolvePromise()
      else reject(new Error(stderr.trim().slice(-4000) || `${command} exited with code ${code}`))
    })
    if (signal) {
      const abort = (): void => {
        child.kill()
      }
      if (signal.aborted) abort()
      signal.addEventListener('abort', abort, { once: true })
      child.on('close', () => signal.removeEventListener('abort', abort))
    }
  })
}

function escapeConcatPath(path: string): string {
  return resolve(path).replace(/\\/g, '/').replace(/'/g, "'\\''")
}

function escapeSubtitlePath(path: string): string {
  return resolve(path).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

export class ExportTool {
  async export(
    plan: EditingPlan,
    outputPath: string,
    subtitlePath: string,
    ffmpegPath: string | undefined,
    burnSubtitles: boolean,
    onProgress: (current: number, total: number, message: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const command = ffmpegPath?.trim() || 'ffmpeg'
    const tempDirectory = join(dirname(outputPath), `.agent-render-${plan.id}`)
    await mkdir(tempDirectory, { recursive: true })
    await mkdir(dirname(outputPath), { recursive: true })

    try {
      const renderedClips: string[] = []
      const totalSteps = plan.videoClips.length + 2

      for (let index = 0; index < plan.videoClips.length; index += 1) {
        if (signal?.aborted) throw new Error('任务已取消')
        const clip = plan.videoClips[index]
        const clipPath = join(tempDirectory, `clip-${String(index + 1).padStart(4, '0')}.mp4`)
        renderedClips.push(clipPath)
        onProgress(index, totalSteps, `正在渲染视频片段 ${index + 1}/${plan.videoClips.length}`)
        await run(
          command,
          [
            '-y',
            '-ss',
            clip.sourceStartSeconds.toFixed(3),
            '-t',
            clip.durationSeconds.toFixed(3),
            '-i',
            clip.sourcePath,
            '-an',
            '-vf',
            `scale=${plan.canvas.width}:${plan.canvas.height}:force_original_aspect_ratio=increase,crop=${plan.canvas.width}:${plan.canvas.height},fps=${plan.canvas.fps},setsar=1`,
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '20',
            '-pix_fmt',
            'yuv420p',
            clipPath
          ],
          signal
        )
      }

      const concatPath = join(tempDirectory, 'concat.txt')
      await writeFile(
        concatPath,
        renderedClips.map((path) => `file '${escapeConcatPath(path)}'`).join('\n'),
        'utf8'
      )
      const videoOnlyPath = join(tempDirectory, 'video-only.mp4')
      onProgress(plan.videoClips.length, totalSteps, '正在合并视频片段')
      await run(
        command,
        ['-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-c', 'copy', videoOnlyPath],
        signal
      )

      const args = ['-y', '-i', videoOnlyPath, '-i', plan.voice.sourcePath]
      if (burnSubtitles) {
        args.push('-vf', `subtitles='${escapeSubtitlePath(subtitlePath)}'`)
      }
      args.push(
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-c:v',
        burnSubtitles ? 'libx264' : 'copy',
        ...(burnSubtitles ? ['-preset', 'veryfast', '-crf', '20'] : []),
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-t',
        plan.durationSeconds.toFixed(3),
        '-movflags',
        '+faststart',
        outputPath
      )
      onProgress(plan.videoClips.length + 1, totalSteps, '正在合并配音并输出 MP4')
      await run(command, args, signal)
      onProgress(totalSteps, totalSteps, 'MP4 导出完成')
      return outputPath
    } finally {
      await rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
