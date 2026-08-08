import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { MediaAsset } from '../../../shared/agent/editingPlan'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'])

interface ProbeOutput {
  format?: { duration?: string }
  streams?: Array<{
    codec_type?: string
    width?: number
    height?: number
    avg_frame_rate?: string
  }>
}

function assetId(path: string): string {
  return `asset-${createHash('sha1').update(path).digest('hex').slice(0, 12)}`
}

function parseFps(value?: string): number | undefined {
  if (!value) return undefined
  const [a, b] = value.split('/').map(Number)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return undefined
  return a / b
}

async function listVideoFiles(directory: string): Promise<string[]> {
  const result: string[] = []
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...(await listVideoFiles(path)))
    else if (entry.isFile() && VIDEO_EXTENSIONS.has(extname(entry.name).toLowerCase()))
      result.push(path)
  }
  result.sort((left, right) => left.localeCompare(right))
  return result
}

function runProcess(command: string, args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Uint8Array | string) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk: Uint8Array | string) => (stderr += String(chunk)))
    child.on('error', reject)
    child.on('close', (code: number | null) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`))
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

export class MediaTool {
  async scan(
    directory: string,
    ffprobePath: string | undefined,
    requireProbe: boolean,
    onProgress: (current: number, total: number, message: string) => void,
    signal?: AbortSignal
  ): Promise<MediaAsset[]> {
    const info = await stat(directory)
    if (!info.isDirectory()) throw new Error('素材路径不是文件夹')
    const files = await listVideoFiles(directory)
    if (files.length === 0) throw new Error('素材文件夹里没有找到视频')

    const command = ffprobePath?.trim() || 'ffprobe'
    const assets: MediaAsset[] = []
    let probeAvailable = true

    for (let index = 0; index < files.length; index += 1) {
      if (signal?.aborted) throw new Error('任务已取消')
      const path = files[index]
      onProgress(index, files.length, `正在扫描素材 ${index + 1}/${files.length}`)
      let asset: MediaAsset | undefined

      if (probeAvailable) {
        try {
          const json = await runProcess(
            command,
            [
              '-v',
              'error',
              '-show_entries',
              'format=duration:stream=codec_type,width,height,avg_frame_rate',
              '-of',
              'json',
              path
            ],
            signal
          )
          const probe = JSON.parse(json) as ProbeOutput
          const video = probe.streams?.find((stream) => stream.codec_type === 'video')
          const duration = Number(probe.format?.duration)
          if (Number.isFinite(duration) && duration > 0) {
            asset = {
              id: assetId(path),
              path,
              fileName: basename(path),
              durationSeconds: duration,
              width: video?.width,
              height: video?.height,
              fps: parseFps(video?.avg_frame_rate),
              metadataSource: 'ffprobe'
            }
          }
        } catch (error) {
          if (String(error).includes('ENOENT')) probeAvailable = false
          else console.warn('ffprobe 素材失败：', path, error)
        }
      }

      if (!asset) {
        if (requireProbe) {
          throw new Error(
            `无法读取素材时长，请安装 FFmpeg/ffprobe 或在任务中指定 ffprobePath：${path}`
          )
        }
        asset = {
          id: assetId(path),
          path,
          fileName: basename(path),
          durationSeconds: 60,
          metadataSource: 'fallback'
        }
      }
      assets.push(asset)
    }
    onProgress(files.length, files.length, `素材扫描完成，共 ${files.length} 条`)
    return assets
  }
}
