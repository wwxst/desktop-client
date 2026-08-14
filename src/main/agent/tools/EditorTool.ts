import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { EditingPlan, EditorCommand } from '../../../shared/agent/editingPlan'

export interface EditorStageResult {
  planPath: string
  commandPath: string
  commands: EditorCommand[]
}

export function planToEditorCommands(plan: EditingPlan): EditorCommand[] {
  const commands: EditorCommand[] = [
    { type: 'project.create', projectId: plan.id, title: plan.title },
    { type: 'canvas.set', ...plan.canvas },
    { type: 'track.ensure', trackId: 'video-main', trackType: 'video' },
    { type: 'track.ensure', trackId: 'audio-voice', trackType: 'audio' },
    { type: 'track.ensure', trackId: 'subtitle-main', trackType: 'subtitle' },
    { type: 'track.ensure', trackId: 'overlay-main', trackType: 'overlay' }
  ]

  const imported = new Set<string>()
  for (const clip of plan.videoClips) {
    if (!imported.has(clip.assetId)) {
      imported.add(clip.assetId)
      commands.push({
        type: 'asset.import',
        assetId: clip.assetId,
        path: clip.sourcePath,
        mediaType: 'video'
      })
    }
    commands.push({
      type: 'clip.add',
      clipId: clip.id,
      assetId: clip.assetId,
      trackId: 'video-main',
      timelineStartSeconds: clip.timelineStartSeconds,
      durationSeconds: clip.durationSeconds,
      sourceStartSeconds: clip.sourceStartSeconds,
      sourceDurationSeconds: clip.sourceDurationSeconds
    })
  }

  const voiceAssetId = `${plan.id}-voice-asset`
  commands.push({
    type: 'asset.import',
    assetId: voiceAssetId,
    path: plan.voice.sourcePath,
    mediaType: 'audio'
  })
  commands.push({
    type: 'audio.add',
    clipId: plan.voice.id,
    assetId: voiceAssetId,
    trackId: 'audio-voice',
    timelineStartSeconds: plan.voice.timelineStartSeconds,
    durationSeconds: plan.voice.durationSeconds,
    volume: plan.voice.volume
  })
  commands.push({ type: 'subtitle.batchAdd', trackId: 'subtitle-main', cues: plan.subtitles })
  for (const overlay of plan.overlays) {
    commands.push({ type: 'text.add', trackId: 'overlay-main', overlay })
  }
  for (const overlay of plan.imageOverlays) {
    const assetId = `${plan.id}-${overlay.id}-asset`
    commands.push({ type: 'asset.import', assetId, path: overlay.sourcePath, mediaType: 'image' })
    commands.push({ type: 'image.add', trackId: 'overlay-main', assetId, overlay })
  }
  return commands
}

export class EditorTool {
  async stage(plan: EditingPlan, directory: string): Promise<EditorStageResult> {
    await mkdir(directory, { recursive: true })
    const planPath = join(directory, 'editing-plan.json')
    const commandPath = join(directory, 'editor-commands.json')
    const commands = planToEditorCommands(plan)
    await writeFile(planPath, JSON.stringify(plan, null, 2), 'utf8')
    await writeFile(commandPath, JSON.stringify(commands, null, 2), 'utf8')
    return { planPath, commandPath, commands }
  }
}
