import type { TtsLanguageInfo, TtsModelEngine, TtsVoice, TtsVoiceGender } from '../../shared/tts'

export interface InternalTtsLanguage {
  code: string
  engineCode: string
}

export interface InternalTtsModel {
  id: string
  name: string
  description: string
  engine: TtsModelEngine
  licenseName: string
  licenseNote: string
  archiveUrl: string
  directoryName: string
  estimatedDownloadMb: number
  supportedLanguages: InternalTtsLanguage[]
  requiredFiles: string[]
  voices: TtsVoice[]
}

export const TTS_LANGUAGES: TtsLanguageInfo[] = [
  { code: 'zh-CN', name: '中文', englishName: 'Chinese' },
  { code: 'en-US', name: '英语（美国）', englishName: 'English (US)' },
  { code: 'en-GB', name: '英语（英国）', englishName: 'English (UK)' },
  { code: 'es-ES', name: '西班牙语', englishName: 'Spanish' },
  { code: 'pt-BR', name: '葡萄牙语（巴西）', englishName: 'Portuguese (Brazil)' },
  { code: 'id-ID', name: '印尼语', englishName: 'Indonesian' },
  { code: 'fr-FR', name: '法语', englishName: 'French' },
  { code: 'de-DE', name: '德语', englishName: 'German' },
  { code: 'ja-JP', name: '日语', englishName: 'Japanese' },
  { code: 'ko-KR', name: '韩语', englishName: 'Korean' },
  { code: 'vi-VN', name: '越南语', englishName: 'Vietnamese' },
  { code: 'ru-RU', name: '俄语', englishName: 'Russian' },
  { code: 'ar-SA', name: '阿拉伯语', englishName: 'Arabic' },
  { code: 'hi-IN', name: '印地语', englishName: 'Hindi' },
  { code: 'it-IT', name: '意大利语', englishName: 'Italian' },
  { code: 'nl-NL', name: '荷兰语', englishName: 'Dutch' },
  { code: 'pl-PL', name: '波兰语', englishName: 'Polish' },
  { code: 'tr-TR', name: '土耳其语', englishName: 'Turkish' },
  { code: 'uk-UA', name: '乌克兰语', englishName: 'Ukrainian' },
  { code: 'sv-SE', name: '瑞典语', englishName: 'Swedish' },
  { code: 'da-DK', name: '丹麦语', englishName: 'Danish' },
  { code: 'fi-FI', name: '芬兰语', englishName: 'Finnish' },
  { code: 'cs-CZ', name: '捷克语', englishName: 'Czech' },
  { code: 'el-GR', name: '希腊语', englishName: 'Greek' },
  { code: 'hu-HU', name: '匈牙利语', englishName: 'Hungarian' },
  { code: 'ro-RO', name: '罗马尼亚语', englishName: 'Romanian' },
  { code: 'bg-BG', name: '保加利亚语', englishName: 'Bulgarian' },
  { code: 'hr-HR', name: '克罗地亚语', englishName: 'Croatian' },
  { code: 'et-EE', name: '爱沙尼亚语', englishName: 'Estonian' },
  { code: 'lt-LT', name: '立陶宛语', englishName: 'Lithuanian' },
  { code: 'lv-LV', name: '拉脱维亚语', englishName: 'Latvian' },
  { code: 'sk-SK', name: '斯洛伐克语', englishName: 'Slovak' },
  { code: 'sl-SI', name: '斯洛文尼亚语', englishName: 'Slovenian' }
]

const KOKORO_V1_0_NAMES = [
  'af_alloy',
  'af_aoede',
  'af_bella',
  'af_heart',
  'af_jessica',
  'af_kore',
  'af_nicole',
  'af_nova',
  'af_river',
  'af_sarah',
  'af_sky',
  'am_adam',
  'am_echo',
  'am_eric',
  'am_fenrir',
  'am_liam',
  'am_michael',
  'am_onyx',
  'am_puck',
  'am_santa',
  'bf_alice',
  'bf_emma',
  'bf_isabella',
  'bf_lily',
  'bm_daniel',
  'bm_fable',
  'bm_george',
  'bm_lewis',
  'ef_dora',
  'em_alex',
  'ff_siwis',
  'hf_alpha',
  'hf_beta',
  'hm_omega',
  'hm_psi',
  'if_sara',
  'im_nicola',
  'jf_alpha',
  'jf_gongitsune',
  'jf_nezumi',
  'jf_tebukuro',
  'jm_kumo',
  'pf_dora',
  'pm_alex',
  'pm_santa',
  'zf_xiaobei',
  'zf_xiaoni',
  'zf_xiaoxiao',
  'zf_xiaoyi',
  'zm_yunjian',
  'zm_yunxi',
  'zm_yunxia',
  'zm_yunyang'
] as const

const KOKORO_V1_1_NAMES = [
  'af_maple',
  'af_sol',
  'bf_vale',
  'zf_001',
  'zf_002',
  'zf_003',
  'zf_004',
  'zf_005',
  'zf_006',
  'zf_007',
  'zf_008',
  'zf_017',
  'zf_018',
  'zf_019',
  'zf_021',
  'zf_022',
  'zf_023',
  'zf_024',
  'zf_026',
  'zf_027',
  'zf_028',
  'zf_032',
  'zf_036',
  'zf_038',
  'zf_039',
  'zf_040',
  'zf_042',
  'zf_043',
  'zf_044',
  'zf_046',
  'zf_047',
  'zf_048',
  'zf_049',
  'zf_051',
  'zf_059',
  'zf_060',
  'zf_067',
  'zf_070',
  'zf_071',
  'zf_072',
  'zf_073',
  'zf_074',
  'zf_075',
  'zf_076',
  'zf_077',
  'zf_078',
  'zf_079',
  'zf_083',
  'zf_084',
  'zf_085',
  'zf_086',
  'zf_087',
  'zf_088',
  'zf_090',
  'zf_092',
  'zf_093',
  'zf_094',
  'zf_099',
  'zm_009',
  'zm_010',
  'zm_011',
  'zm_012',
  'zm_013',
  'zm_014',
  'zm_015',
  'zm_016',
  'zm_020',
  'zm_025',
  'zm_029',
  'zm_030',
  'zm_031',
  'zm_033',
  'zm_034',
  'zm_035',
  'zm_037',
  'zm_041',
  'zm_045',
  'zm_050',
  'zm_052',
  'zm_053',
  'zm_054',
  'zm_055',
  'zm_056',
  'zm_057',
  'zm_058',
  'zm_061',
  'zm_062',
  'zm_063',
  'zm_064',
  'zm_065',
  'zm_066',
  'zm_068',
  'zm_069',
  'zm_080',
  'zm_081',
  'zm_082',
  'zm_089',
  'zm_091',
  'zm_095',
  'zm_096',
  'zm_097',
  'zm_098',
  'zm_100'
] as const

const SUPERTONIC_LANGUAGES: InternalTtsLanguage[] = [
  { code: 'ar-SA', engineCode: 'ar' },
  { code: 'bg-BG', engineCode: 'bg' },
  { code: 'cs-CZ', engineCode: 'cs' },
  { code: 'da-DK', engineCode: 'da' },
  { code: 'de-DE', engineCode: 'de' },
  { code: 'el-GR', engineCode: 'el' },
  { code: 'en-US', engineCode: 'en' },
  { code: 'en-GB', engineCode: 'en' },
  { code: 'es-ES', engineCode: 'es' },
  { code: 'et-EE', engineCode: 'et' },
  { code: 'fi-FI', engineCode: 'fi' },
  { code: 'fr-FR', engineCode: 'fr' },
  { code: 'hi-IN', engineCode: 'hi' },
  { code: 'hr-HR', engineCode: 'hr' },
  { code: 'hu-HU', engineCode: 'hu' },
  { code: 'id-ID', engineCode: 'id' },
  { code: 'it-IT', engineCode: 'it' },
  { code: 'ja-JP', engineCode: 'ja' },
  { code: 'ko-KR', engineCode: 'ko' },
  { code: 'lt-LT', engineCode: 'lt' },
  { code: 'lv-LV', engineCode: 'lv' },
  { code: 'nl-NL', engineCode: 'nl' },
  { code: 'pl-PL', engineCode: 'pl' },
  { code: 'pt-BR', engineCode: 'pt' },
  { code: 'ro-RO', engineCode: 'ro' },
  { code: 'ru-RU', engineCode: 'ru' },
  { code: 'sk-SK', engineCode: 'sk' },
  { code: 'sl-SI', engineCode: 'sl' },
  { code: 'sv-SE', engineCode: 'sv' },
  { code: 'tr-TR', engineCode: 'tr' },
  { code: 'uk-UA', engineCode: 'uk' },
  { code: 'vi-VN', engineCode: 'vi' }
]

function getGenderFromSpeakerName(name: string): TtsVoiceGender {
  const genderCode = name.at(1)

  if (genderCode === 'f') {
    return 'female'
  }

  if (genderCode === 'm') {
    return 'male'
  }

  return 'unknown'
}

function getKokoroV10LanguageCodes(name: string): string[] {
  if (name.startsWith('zf_') || name.startsWith('zm_')) {
    return ['zh-CN']
  }

  if (name.startsWith('bf_') || name.startsWith('bm_')) {
    return ['en-GB']
  }

  return ['en-US']
}

function getAccent(name: string): string | undefined {
  const accentMap: Record<string, string> = {
    a: '美式英语',
    b: '英式英语',
    e: '西语口音英语',
    f: '法语口音英语',
    h: '印地语口音英语',
    i: '意大利语口音英语',
    j: '日语口音英语',
    p: '葡语口音英语',
    z: '中文'
  }

  return accentMap[name.at(0) ?? '']
}

function toDisplayName(name: string): string {
  if (name.startsWith('zf_')) {
    return `中文女声 ${name.slice(3).toUpperCase()}`
  }

  if (name.startsWith('zm_')) {
    return `中文男声 ${name.slice(3).toUpperCase()}`
  }

  const parts = name.split('_')
  const speakerName = parts.slice(1).join(' ')

  return speakerName
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function createKokoroV10Voices(modelId: string): TtsVoice[] {
  return KOKORO_V1_0_NAMES.map((name, speakerId) => ({
    id: `${modelId}:${name}`,
    modelId,
    speakerId,
    name: toDisplayName(name),
    originalName: name,
    languageCodes: getKokoroV10LanguageCodes(name),
    gender: getGenderFromSpeakerName(name),
    accent: getAccent(name),
    description: `${getAccent(name) ?? '通用'} · 官方音色 ${speakerId}`
  }))
}

function createKokoroV11Voices(modelId: string): TtsVoice[] {
  return KOKORO_V1_1_NAMES.map((name, speakerId) => {
    const isChinese = name.startsWith('z')
    const languageCodes = isChinese ? ['zh-CN'] : name.startsWith('bf_') ? ['en-GB'] : ['en-US']

    return {
      id: `${modelId}:${name}`,
      modelId,
      speakerId,
      name: toDisplayName(name),
      originalName: name,
      languageCodes,
      gender: getGenderFromSpeakerName(name),
      accent: getAccent(name),
      description: `${isChinese ? '中文扩展音色' : '英语音色'} · 官方音色 ${speakerId}`
    }
  })
}

function createSupertonicVoices(modelId: string): TtsVoice[] {
  const allLanguageCodes = SUPERTONIC_LANGUAGES.map((language) => language.code)

  return Array.from({ length: 10 }, (_, speakerId) => ({
    id: `${modelId}:speaker-${speakerId}`,
    modelId,
    speakerId,
    name: `多语言音色 ${String(speakerId + 1).padStart(2, '0')}`,
    originalName: `speaker_${speakerId}`,
    languageCodes: allLanguageCodes,
    gender: 'unknown' as const,
    description: `支持 31 种语言 · 官方音色 ${speakerId}`
  }))
}

const KOKORO_COMMON_FILES = [
  'model.onnx',
  'voices.bin',
  'tokens.txt',
  'lexicon-us-en.txt',
  'lexicon-zh.txt',
  'espeak-ng-data'
]

export const TTS_MODELS: InternalTtsModel[] = [
  {
    id: 'kokoro-multi-lang-v1_0',
    name: 'Kokoro 中英通用版',
    description: '中文与英语共 53 个音色，英语男女声更丰富，适合小说和短视频配音。',
    engine: 'kokoro',
    licenseName: 'Apache-2.0',
    licenseNote: '模型权重采用 Apache-2.0，分发时需保留许可证与版权声明。',
    archiveUrl:
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2',
    directoryName: 'kokoro-multi-lang-v1_0',
    estimatedDownloadMb: 335,
    supportedLanguages: [
      { code: 'zh-CN', engineCode: 'zh' },
      { code: 'en-US', engineCode: 'en' },
      { code: 'en-GB', engineCode: 'en' }
    ],
    requiredFiles: KOKORO_COMMON_FILES,
    voices: createKokoroV10Voices('kokoro-multi-lang-v1_0')
  },
  {
    id: 'kokoro-multi-lang-v1_1',
    name: 'Kokoro 中文扩展版',
    description: '中文与英语共 103 个音色，其中包含 100 个中文男女声。',
    engine: 'kokoro',
    licenseName: 'Apache-2.0',
    licenseNote: '模型权重采用 Apache-2.0，分发时需保留许可证与版权声明。',
    archiveUrl:
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_1.tar.bz2',
    directoryName: 'kokoro-multi-lang-v1_1',
    estimatedDownloadMb: 340,
    supportedLanguages: [
      { code: 'zh-CN', engineCode: 'zh' },
      { code: 'en-US', engineCode: 'en' },
      { code: 'en-GB', engineCode: 'en' }
    ],
    requiredFiles: KOKORO_COMMON_FILES,
    voices: createKokoroV11Voices('kokoro-multi-lang-v1_1')
  },
  {
    id: 'supertonic-3-int8-2026-05-11',
    name: 'Supertonic 3 多语言版',
    description: '一个模型支持 31 种语言和 10 个音色，适合海外小说批量配音。',
    engine: 'supertonic',
    licenseName: 'OpenRAIL-M',
    licenseNote: '模型允许商业使用但包含用途限制和署名要求，上线前请审阅完整许可证。',
    archiveUrl:
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-supertonic-3-tts-int8-2026-05-11.tar.bz2',
    directoryName: 'sherpa-onnx-supertonic-3-tts-int8-2026-05-11',
    estimatedDownloadMb: 180,
    supportedLanguages: SUPERTONIC_LANGUAGES,
    requiredFiles: [
      'duration_predictor.int8.onnx',
      'text_encoder.int8.onnx',
      'vector_estimator.int8.onnx',
      'vocoder.int8.onnx',
      'tts.json',
      'unicode_indexer.bin',
      'voice.bin'
    ],
    voices: createSupertonicVoices('supertonic-3-int8-2026-05-11')
  }
]

export function findTtsModel(modelId: string): InternalTtsModel | undefined {
  return TTS_MODELS.find((model) => model.id === modelId)
}

export function getEngineLanguageCode(model: InternalTtsModel, language: string): string | null {
  return (
    model.supportedLanguages.find((supportedLanguage) => supportedLanguage.code === language)
      ?.engineCode ?? null
  )
}
