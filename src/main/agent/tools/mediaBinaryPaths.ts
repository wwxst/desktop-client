import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export type BundledMediaTool = 'ffmpeg' | 'ffprobe'

function candidatePaths(tool: BundledMediaTool): string[] {
  const executable = process.platform === 'win32' ? `${tool}.exe` : tool
  const appPath = app.getAppPath()

  if (!app.isPackaged) {
    return [join(appPath, 'resources', 'ffmpeg', executable)]
  }

  return [
    join(process.resourcesPath, 'ffmpeg', executable),
    join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'ffmpeg', executable)
  ]
}

export function resolveBundledMediaTool(tool: BundledMediaTool): string | undefined {
  return candidatePaths(tool).find((candidate) => existsSync(candidate))
}
