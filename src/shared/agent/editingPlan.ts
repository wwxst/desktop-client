export type StoryRole = 'hook' | 'setup' | 'conflict' | 'turn' | 'climax' | 'ending'
export type StoryPace = 'slow' | 'normal' | 'fast' | 'very-fast'

export interface StorySourceSegment {
  id: string
  index: number
  text: string
}

export interface StorySegmentAnalysis extends StorySourceSegment {
  role: StoryRole
  pace: StoryPace
  importance: number
  note?: string
}

export interface StoryAnalysis {
  summary: string
  tone: string
  segments: StorySegmentAnalysis[]
}

export interface TtsTimedSegment extends StorySourceSegment {
  startSeconds: number
  endSeconds: number
  durationSeconds: number
  audioPath: string
}

export interface TtsWorkflowOutput {
  audioPath: string
  durationSeconds: number
  segments: TtsTimedSegment[]
}

export interface SubtitleCue {
  id: string
  text: string
  startSeconds: number
  endSeconds: number
}

export interface MediaAsset {
  id: string
  path: string
  fileName: string
  durationSeconds: number
  width?: number
  height?: number
  fps?: number
  metadataSource: 'ffprobe' | 'fallback'
}

export interface EditStrategy {
  veryFastClipSeconds: [number, number]
  fastClipSeconds: [number, number]
  normalClipSeconds: [number, number]
  slowClipSeconds: [number, number]
  avoidRecentAssetCount: number
  explanation: string
}

export interface VideoClipPlan {
  id: string
  assetId: string
  sourcePath: string
  timelineStartSeconds: number
  durationSeconds: number
  sourceStartSeconds: number
  sourceDurationSeconds: number
}

export interface AudioClipPlan {
  id: string
  sourcePath: string
  timelineStartSeconds: number
  durationSeconds: number
  volume: number
}

export interface TextOverlayPlan {
  id: string
  text: string
  startSeconds: number
  endSeconds: number
  kind: 'app-name' | 'cta' | 'custom'
}

export interface ImageOverlayPlan {
  id: string
  sourcePath: string
  startSeconds: number
  endSeconds: number
  kind: 'app-icon' | 'custom'
  anchor: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
  widthRatio: number
}

export interface EditingPlan {
  version: 1
  id: string
  seed: number
  title: string
  durationSeconds: number
  canvas: {
    width: number
    height: number
    fps: number
  }
  videoClips: VideoClipPlan[]
  voice: AudioClipPlan
  subtitles: SubtitleCue[]
  overlays: TextOverlayPlan[]
  imageOverlays: ImageOverlayPlan[]
  metadata: {
    workflow: 'novel-decompression-v1'
    createdAt: number
  }
}

export type ReviewSeverity = 'info' | 'warning' | 'error'

export interface ReviewIssue {
  code: string
  severity: ReviewSeverity
  message: string
  autoFixable: boolean
}

export interface ReviewResult {
  passed: boolean
  score: number
  issues: ReviewIssue[]
  modelComment?: string
}

export type EditorCommand =
  | { type: 'project.create'; projectId: string; title: string }
  | { type: 'canvas.set'; width: number; height: number; fps: number }
  | { type: 'track.ensure'; trackId: string; trackType: 'video' | 'audio' | 'subtitle' | 'overlay' }
  | { type: 'asset.import'; assetId: string; path: string; mediaType: 'video' | 'audio' | 'image' }
  | {
      type: 'clip.add'
      clipId: string
      assetId: string
      trackId: string
      timelineStartSeconds: number
      durationSeconds: number
      sourceStartSeconds: number
      sourceDurationSeconds: number
    }
  | {
      type: 'audio.add'
      clipId: string
      assetId: string
      trackId: string
      timelineStartSeconds: number
      durationSeconds: number
      volume: number
    }
  | { type: 'subtitle.batchAdd'; trackId: string; cues: SubtitleCue[] }
  | { type: 'text.add'; trackId: string; overlay: TextOverlayPlan }
  | { type: 'image.add'; trackId: string; assetId: string; overlay: ImageOverlayPlan }
