import type { TtsModelInfo } from '../../../../shared/tts'

export interface PluginPresentation {
  name: string
  description: string
  identifier: string
  version: string
  category: string
  overview: string
}

const PLUGIN_PRESENTATIONS: Record<string, PluginPresentation> = {
  'kokoro-multi-lang-v1_1': {
    name: '中文高品质音色',
    description: '适合中文旁白与角色配音',
    identifier: 'voice.zh-premium',
    version: '1.1',
    category: '中文配音',
    overview: '面向中文内容创作的本地音色插件，适合旁白、口播和角色对白。'
  },
  'kokoro-multi-lang-v1_0': {
    name: '中英通用音色',
    description: '适合中英文混合内容',
    identifier: 'voice.zh-en',
    version: '1.0',
    category: '双语配音',
    overview: '兼顾中文与英文内容的本地音色插件，适合双语旁白和混合语言文案。'
  },
  'supertonic-3-int8-2026-05-11': {
    name: '多语言音色',
    description: '适合多语种内容创作',
    identifier: 'voice.multilingual',
    version: '2026.05.11',
    category: '多语言配音',
    overview: '覆盖多种常用语言的本地音色插件，适合跨语言视频和多地区内容创作。'
  }
}

export function getPluginPresentation(model: TtsModelInfo): PluginPresentation {
  return (
    PLUGIN_PRESENTATIONS[model.id] ?? {
      name: '扩展配音插件',
      description: '提供更多本地配音选择',
      identifier: 'voice.extension',
      version: '1.0',
      category: '配音插件',
      overview: '为本地内容创作提供更多语言和音色选择。'
    }
  )
}

const LANGUAGE_NAMES: Record<string, string> = {
  'zh-CN': '中文',
  'en-US': '英语',
  'en-GB': '英语',
  'es-ES': '西班牙语',
  'pt-BR': '葡萄牙语',
  'id-ID': '印尼语',
  'fr-FR': '法语',
  'de-DE': '德语',
  'ja-JP': '日语',
  'ko-KR': '韩语',
  'vi-VN': '越南语',
  'ru-RU': '俄语',
  'ar-SA': '阿拉伯语',
  'hi-IN': '印地语',
  'it-IT': '意大利语',
  'nl-NL': '荷兰语',
  'pl-PL': '波兰语',
  'tr-TR': '土耳其语',
  'uk-UA': '乌克兰语',
  'sv-SE': '瑞典语',
  'da-DK': '丹麦语',
  'fi-FI': '芬兰语',
  'cs-CZ': '捷克语',
  'el-GR': '希腊语',
  'hu-HU': '匈牙利语',
  'ro-RO': '罗马尼亚语',
  'bg-BG': '保加利亚语',
  'hr-HR': '克罗地亚语',
  'et-EE': '爱沙尼亚语',
  'lt-LT': '立陶宛语',
  'lv-LV': '拉脱维亚语',
  'sk-SK': '斯洛伐克语',
  'sl-SI': '斯洛文尼亚语'
}

export function getPluginLanguageNames(model: TtsModelInfo): string[] {
  return [...new Set(model.languages.map((language) => LANGUAGE_NAMES[language] ?? language))]
}
