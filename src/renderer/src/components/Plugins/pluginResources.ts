import type { TtsModelInfo } from '../../../../shared/tts'

interface PluginResourcePresentation {
  name: string
  description: string
}

const RESOURCE_PRESENTATIONS: Record<string, PluginResourcePresentation> = {
  'kokoro-multi-lang-v1_1': {
    name: '中文高品质音色',
    description: '适合中文旁白与角色配音'
  },
  'kokoro-multi-lang-v1_0': {
    name: '中英通用音色',
    description: '适合中英文混合内容'
  },
  'supertonic-3-int8-2026-05-11': {
    name: '多语言音色',
    description: '适合多语种内容创作'
  }
}

export function getPluginResourcePresentation(model: TtsModelInfo): PluginResourcePresentation {
  return (
    RESOURCE_PRESENTATIONS[model.id] ?? {
      name: '扩展语音资源',
      description: '提供更多本地配音选择'
    }
  )
}
