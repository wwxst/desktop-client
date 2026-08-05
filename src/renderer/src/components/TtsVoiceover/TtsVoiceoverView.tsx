import {
  CirclePlay,
  Headphones,
  LoaderCircle,
  Play,
  Plug,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Square
} from 'lucide-react'
import { useEffect, useMemo, useState, type JSX } from 'react'

import type {
  TtsCatalogResponse,
  TtsGenerateRequest,
  TtsJobProgress,
  TtsVoice,
  TtsVoiceGender
} from '../../../../shared/tts'
import './TtsVoiceover.css'

const MAX_TEXT_LENGTH = 100_000
const speedOptions = [
  { value: '0.8', label: '0.8x（较慢）' },
  { value: '1', label: '1.0x（正常）' },
  { value: '1.2', label: '1.2x（较快）' },
  { value: '1.5', label: '1.5x（快速）' }
]

const voiceFilterOptions: Array<{ value: 'all' | TtsVoiceGender; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'female', label: '女声' },
  { value: 'male', label: '男声' },
  { value: 'unknown', label: '通用' }
]

const previewSamples: Record<string, string> = {
  'zh-CN':
    '智剪是一款简单好用、功能丰富的智能创作工具，可以满足小说推文、短剧制作等多种创作需求，让内容生产更轻松、更高效。',
  'en-US':
    'Smart Edit is an easy-to-use, feature-rich creative tool for novel promotion, short drama production, and more, making content creation simpler and more efficient.',
  'en-GB':
    'Smart Edit is an easy-to-use, feature-rich creative tool for novel promotion, short drama production, and more, making content creation simpler and more efficient.',
  'es-ES':
    'Smart Edit es una herramienta creativa fácil de usar y repleta de funciones, ideal para promocionar novelas, producir dramas cortos y mucho más, haciendo que la creación de contenido sea más sencilla y eficiente.',
  'pt-BR':
    'O Smart Edit é uma ferramenta criativa fácil de usar e repleta de recursos, ideal para promover romances, produzir minidramas e muito mais, tornando a criação de conteúdo mais simples e eficiente.',
  'id-ID':
    'Smart Edit adalah alat kreasi yang mudah digunakan dan kaya fitur, cocok untuk promosi novel, produksi drama pendek, dan berbagai kebutuhan lainnya, sehingga pembuatan konten menjadi lebih mudah dan efisien.',
  'fr-FR':
    "Smart Edit est un outil de création simple à utiliser et riche en fonctionnalités, adapté à la promotion de romans, à la production de mini-séries et à bien d'autres besoins, pour créer du contenu plus facilement et plus efficacement.",
  'de-DE':
    'Smart Edit ist ein benutzerfreundliches und vielseitiges Kreativwerkzeug für Romanwerbung, Kurzdramen und viele weitere Inhalte und macht die Produktion einfacher und effizienter.',
  'ja-JP':
    '智剪は、使いやすく機能豊富なクリエイティブツールです。小説のプロモーションやショートドラマ制作など、さまざまな創作ニーズに対応し、コンテンツ制作をより簡単で効率的にします。',
  'ko-KR':
    '스마트 에디트는 사용하기 쉽고 기능이 풍부한 창작 도구입니다. 소설 홍보와 숏드라마 제작 등 다양한 콘텐츠 작업을 더 쉽고 효율적으로 완성할 수 있습니다.',
  'vi-VN':
    'Smart Edit là công cụ sáng tạo dễ sử dụng và giàu tính năng, đáp ứng nhu cầu quảng bá tiểu thuyết, sản xuất phim ngắn và nhiều nội dung khác, giúp quá trình sáng tạo đơn giản và hiệu quả hơn.',
  'ru-RU':
    'Smart Edit — это простой и многофункциональный инструмент для продвижения романов, создания коротких сериалов и других задач, который делает производство контента легче и эффективнее.',
  'ar-SA':
    'سمارت إيديت أداة إبداعية سهلة الاستخدام وغنية بالميزات، تناسب الترويج للروايات وإنتاج المسلسلات القصيرة وغيرها من الاحتياجات، لتجعل صناعة المحتوى أسهل وأكثر كفاءة.',
  'hi-IN':
    'स्मार्ट एडिट एक आसान और सुविधाओं से भरपूर रचनात्मक टूल है, जो उपन्यास प्रचार, लघु नाटक निर्माण और अन्य जरूरतों को पूरा करके कंटेंट बनाना अधिक सरल और प्रभावी बनाता है।',
  'it-IT':
    'Smart Edit è uno strumento creativo facile da usare e ricco di funzionalità, ideale per promuovere romanzi, produrre fiction brevi e molto altro, rendendo la creazione di contenuti più semplice ed efficiente.',
  'nl-NL':
    'Smart Edit is een gebruiksvriendelijke en veelzijdige creatieve tool voor boekpromotie, korte dramaseries en meer, waarmee je sneller en eenvoudiger content maakt.',
  'pl-PL':
    'Smart Edit to łatwe w obsłudze i bogate w funkcje narzędzie do promocji powieści, tworzenia krótkich seriali i wielu innych treści, dzięki któremu praca jest prostsza i wydajniejsza.',
  'tr-TR':
    'Smart Edit, roman tanıtımı, kısa dizi yapımı ve daha birçok içerik ihtiyacı için kolay kullanımlı ve zengin özellikli bir yaratıcı araçtır; içerik üretimini daha basit ve verimli hale getirir.',
  'uk-UA':
    'Smart Edit — це простий у використанні та багатофункціональний інструмент для просування романів, створення коротких серіалів та інших завдань, який робить виробництво контенту легшим і ефективнішим.',
  'sv-SE':
    'Smart Edit är ett lättanvänt och funktionsrikt kreativt verktyg för bokmarknadsföring, kortdramer och mycket mer, som gör innehållsskapandet enklare och effektivare.',
  'da-DK':
    'Smart Edit er et brugervenligt og funktionsrigt kreativt værktøj til bogpromovering, korte dramaserier og meget mere, som gør indholdsproduktionen lettere og mere effektiv.',
  'fi-FI':
    'Smart Edit on helppokäyttöinen ja monipuolinen luova työkalu romaanien markkinointiin, lyhytdraamojen tuotantoon ja moneen muuhun tarpeeseen, mikä tekee sisällöntuotannosta helpompaa ja tehokkaampaa.',
  'cs-CZ':
    'Smart Edit je snadno použitelný a bohatě vybavený kreativní nástroj pro propagaci románů, tvorbu krátkých seriálů a mnoho dalších potřeb, který usnadňuje a zefektivňuje tvorbu obsahu.',
  'el-GR':
    'Το Smart Edit είναι ένα εύχρηστο και πλούσιο σε λειτουργίες δημιουργικό εργαλείο για την προώθηση μυθιστορημάτων, την παραγωγή σύντομων σειρών και πολλές ακόμη ανάγκες, κάνοντας τη δημιουργία περιεχομένου ευκολότερη και αποδοτικότερη.',
  'hu-HU':
    'A Smart Edit egy könnyen használható, sokoldalú kreatív eszköz regények népszerűsítéséhez, rövid sorozatok készítéséhez és sok más feladathoz, amely egyszerűbbé és hatékonyabbá teszi a tartalomgyártást.',
  'ro-RO':
    'Smart Edit este un instrument creativ ușor de folosit și bogat în funcții, potrivit pentru promovarea romanelor, producția de seriale scurte și multe alte nevoi, făcând crearea de conținut mai simplă și mai eficientă.',
  'bg-BG':
    'Smart Edit е лесен за използване и богат на функции творчески инструмент за популяризиране на романи, създаване на кратки сериали и много други задачи, който прави производството на съдържание по-лесно и ефективно.',
  'hr-HR':
    'Smart Edit jednostavan je i bogato opremljen kreativni alat za promociju romana, izradu kratkih serija i mnoge druge potrebe, koji stvaranje sadržaja čini lakšim i učinkovitijim.',
  'et-EE':
    'Smart Edit on lihtne ja võimalusterohke loometööriist romaanide reklaamimiseks, lühidraamade loomiseks ja paljudeks muudeks vajadusteks, muutes sisuloome lihtsamaks ja tõhusamaks.',
  'lt-LT':
    'Smart Edit yra lengvai naudojamas ir funkcionalus kūrybos įrankis romanų reklamai, trumpų serialų kūrimui ir daugeliui kitų poreikių, todėl turinį kurti tampa paprasčiau ir efektyviau.',
  'lv-LV':
    'Smart Edit ir viegli lietojams un daudzfunkcionāls radošais rīks romānu popularizēšanai, īsseriālu veidošanai un daudzām citām vajadzībām, padarot satura radīšanu vienkāršāku un efektīvāku.',
  'sk-SK':
    'Smart Edit je ľahko použiteľný a funkciami nabitý kreatívny nástroj na propagáciu románov, tvorbu krátkych seriálov a mnoho ďalších potrieb, ktorý zjednodušuje a zefektívňuje tvorbu obsahu.',
  'sl-SI':
    'Smart Edit je preprosto in zmogljivo ustvarjalno orodje za promocijo romanov, izdelavo kratkih serij in številne druge potrebe, ki omogoča lažje in učinkovitejše ustvarjanje vsebin.'
}

interface NoticeState {
  type: 'success' | 'error' | 'info'
  text: string
}

function isJobRunning(progress: TtsJobProgress | null): boolean {
  return Boolean(
    progress && ['queued', 'preparing', 'generating', 'merging'].includes(progress.status)
  )
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) {
    return '0 秒'
  }

  const roundedSeconds = Math.round(seconds)
  const hours = Math.floor(roundedSeconds / 3600)
  const minutes = Math.floor((roundedSeconds % 3600) / 60)
  const remainingSeconds = roundedSeconds % 60

  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分 ${remainingSeconds} 秒`
  }

  if (minutes > 0) {
    return `${minutes} 分 ${remainingSeconds} 秒`
  }

  return `${remainingSeconds} 秒`
}

function getVoiceInitial(voice: TtsVoice): string {
  if (voice.gender === 'female') {
    return '女'
  }

  if (voice.gender === 'male') {
    return '男'
  }

  return String(voice.speakerId + 1).padStart(2, '0')
}

interface TtsVoiceoverViewProps {
  onOpenPlugins?: () => void
}

function TtsVoiceoverView({ onOpenPlugins }: TtsVoiceoverViewProps): JSX.Element {
  const [catalog, setCatalog] = useState<TtsCatalogResponse | null>(null)
  const [isCatalogLoading, setIsCatalogLoading] = useState(true)
  const [script, setScript] = useState('')
  const [language, setLanguage] = useState('zh-CN')
  const [voiceId, setVoiceId] = useState('')
  const [speed, setSpeed] = useState('1')
  const [voiceSearch, setVoiceSearch] = useState('')
  const [voiceFilter, setVoiceFilter] = useState<'all' | TtsVoiceGender>('all')
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobProgress, setJobProgress] = useState<TtsJobProgress | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState<NoticeState | null>(null)

  useEffect(() => {
    let isMounted = true

    void window.api
      .listTtsCatalog()
      .then((response) => {
        if (!isMounted) {
          return
        }

        setCatalog(response)

        if (!response.success) {
          setNotice({ type: 'error', text: response.message })
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setNotice({
            type: 'error',
            text: error instanceof Error ? error.message : '本地语音资源读取失败'
          })
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsCatalogLoading(false)
        }
      })

    const removeJobProgressListener = window.api.onTtsJobProgress((progress) => {
      setJobProgress(progress)
      setJobId(progress.jobId)

      if (progress.status === 'completed') {
        setNotice({ type: 'success', text: '配音生成完成，可以试听并保存 WAV 文件' })
      } else if (progress.status === 'failed') {
        setNotice({ type: 'error', text: progress.message })
      } else if (progress.status === 'cancelled') {
        setNotice({ type: 'info', text: progress.message })
      }
    })

    return () => {
      isMounted = false
      removeJobProgressListener()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const languageModels = useMemo(() => {
    return catalog?.models.filter((model) => model.languages.includes(language)) ?? []
  }, [catalog, language])

  const availableVoices = useMemo(() => {
    return languageModels
      .filter((model) => model.status === 'installed')
      .flatMap((model) => model.voices.filter((voice) => voice.languageCodes.includes(language)))
  }, [language, languageModels])

  const visibleVoices = useMemo(() => {
    const normalizedSearch = voiceSearch.trim().toLowerCase()

    return availableVoices.filter((voice) => {
      const matchesGender = voiceFilter === 'all' || voice.gender === voiceFilter
      const matchesSearch =
        !normalizedSearch ||
        voice.name.toLowerCase().includes(normalizedSearch) ||
        voice.originalName.toLowerCase().includes(normalizedSearch) ||
        voice.description.toLowerCase().includes(normalizedSearch)

      return matchesGender && matchesSearch
    })
  }, [availableVoices, voiceFilter, voiceSearch])

  const selectedVoice = useMemo(() => {
    return availableVoices.find((voice) => voice.id === voiceId) ?? availableVoices[0] ?? null
  }, [availableVoices, voiceId])

  const running = isJobRunning(jobProgress)
  const controlsDisabled = running
  const canGenerate = Boolean(
    script.trim() && selectedVoice && !controlsDisabled && script.length <= MAX_TEXT_LENGTH
  )

  const buildRequest = (
    text: string,
    requestVoice: TtsVoice | null = selectedVoice
  ): TtsGenerateRequest | null => {
    if (!requestVoice) {
      setNotice({ type: 'error', text: '请先安装配音插件并选择音色' })
      return null
    }

    return {
      text,
      language,
      modelId: requestVoice.modelId,
      voiceId: requestVoice.id,
      speed: Number(speed)
    }
  }

  const handlePreview = async (voice: TtsVoice): Promise<void> => {
    const previewText = script.trim() || previewSamples[language] || previewSamples['en-US']
    const request = buildRequest(previewText, voice)

    if (!request) {
      return
    }

    setIsPreviewing(true)
    setNotice({ type: 'info', text: '正在使用本机 CPU 生成试听音频' })

    try {
      const response = await window.api.previewTts(request)

      if (!response.success || !response.audioBytes) {
        setNotice({ type: 'error', text: response.message })
        return
      }

      const audioBuffer = new Uint8Array(response.audioBytes).buffer
      const nextPreviewUrl = URL.createObjectURL(
        new Blob([audioBuffer], { type: response.mimeType ?? 'audio/wav' })
      )

      setPreviewUrl((currentUrl) => {
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl)
        }
        return nextPreviewUrl
      })
      setNotice({
        type: 'success',
        text: `试听生成完成，音频时长约 ${formatDuration(response.durationSeconds)}`
      })
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : '试听生成失败'
      })
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleCreateJob = async (): Promise<void> => {
    const request = buildRequest(script.trim())
    if (!request) {
      return
    }

    setNotice(null)
    setJobProgress(null)
    setJobId(null)

    try {
      const response = await window.api.createTtsJob(request)

      if (!response.success || !response.jobId) {
        setNotice({ type: 'error', text: response.message })
        return
      }

      setJobId(response.jobId)
      setJobProgress({
        jobId: response.jobId,
        modelId: request.modelId,
        status: 'queued',
        currentSegment: 0,
        totalSegments: response.totalSegments ?? 0,
        percent: 0,
        message: response.message
      })
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : '配音任务创建失败'
      })
    }
  }

  const handleCancelJob = async (): Promise<void> => {
    if (!jobId) {
      return
    }

    const response = await window.api.cancelTtsJob(jobId)
    setNotice({ type: response.success ? 'info' : 'error', text: response.message })
  }

  const handleSaveJob = async (): Promise<void> => {
    if (!jobId) {
      return
    }

    setIsSaving(true)

    try {
      const response = await window.api.saveTtsJob(jobId)

      if (!response.canceled) {
        setNotice({ type: response.success ? 'success' : 'error', text: response.message })
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="tts-voiceover" aria-label="TTS 配音">
      <header className="tts-voiceover__header">
        <div>
          <p className="tts-voiceover__eyebrow">LOCAL AI AUDIO</p>
          <h1>TTS 配音</h1>
          <p className="tts-voiceover__subtitle">
            文字和语音均在用户电脑本地处理，正式生成支持长文本自动分段。
          </p>
        </div>
      </header>

      {notice && (
        <div className={`tts-notice tts-notice--${notice.type}`} role="status">
          {notice.text}
        </div>
      )}

      <div className="tts-voiceover__content">
        <section className="tts-voiceover__composer" aria-label="文本转换">
          <div className="tts-voiceover__section-heading">
            <div>
              <h2>配音文本</h2>
              <p>长文本会按自然段和标点自动切分，再合并为一个 WAV 文件。</p>
            </div>
            <span className={script.length >= MAX_TEXT_LENGTH ? 'is-limit' : ''}>
              {script.length.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()}
            </span>
          </div>

          <label className="tts-voiceover__field">
            <span className="sr-only">配音文案</span>
            <textarea
              aria-label="配音文案"
              value={script}
              maxLength={MAX_TEXT_LENGTH}
              disabled={running}
              onChange={(event) => setScript(event.target.value)}
              placeholder="粘贴小说、解说稿或其他需要转换成语音的长文本……"
              rows={16}
            />
          </label>

          {jobProgress && (
            <section className="tts-job-card" aria-label="配音任务进度">
              <div className="tts-job-card__heading">
                <div>
                  <strong>{jobProgress.message}</strong>
                  <span>
                    {jobProgress.totalSegments > 0
                      ? `第 ${jobProgress.currentSegment} / ${jobProgress.totalSegments} 段`
                      : '正在准备任务'}
                  </span>
                </div>
                <b>{jobProgress.percent}%</b>
              </div>

              <div className="tts-progress" aria-label={`生成进度 ${jobProgress.percent}%`}>
                <span style={{ width: `${Math.min(100, Math.max(0, jobProgress.percent))}%` }} />
              </div>

              {jobProgress.status === 'completed' && (
                <div className="tts-job-card__result">
                  <span>时长：{formatDuration(jobProgress.durationSeconds)}</span>
                  <span>大小：{formatFileSize(jobProgress.outputSizeBytes)}</span>
                </div>
              )}

              <div className="tts-job-card__actions">
                {running && (
                  <button type="button" onClick={() => void handleCancelJob()}>
                    <Square size={14} fill="currentColor" strokeWidth={1.8} aria-hidden="true" />
                    取消生成
                  </button>
                )}

                {jobProgress.status === 'completed' && (
                  <button
                    className="tts-job-card__save"
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleSaveJob()}
                  >
                    {isSaving ? (
                      <LoaderCircle className="tts-spin" size={15} aria-hidden="true" />
                    ) : (
                      <Save size={15} strokeWidth={1.8} aria-hidden="true" />
                    )}
                    保存 WAV
                  </button>
                )}
              </div>
            </section>
          )}
        </section>

        <aside className="tts-voiceover__preview" aria-label="语言和音色选择">
          <div className="tts-voiceover__language-row">
            <label className="tts-voiceover__language-field">
              <span>文本语言</span>
              <select
                aria-label="文本语言"
                value={language}
                disabled={controlsDisabled || isCatalogLoading}
                onChange={(event) => {
                  setLanguage(event.target.value)
                  setVoiceSearch('')
                  setVoiceFilter('all')
                }}
              >
                {(catalog?.languages ?? []).map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name} · {item.englishName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isCatalogLoading ? (
            <div className="tts-empty-state tts-empty-state--voice" role="status">
              <LoaderCircle className="tts-spin" size={22} aria-hidden="true" />
              <span>正在读取配音资源</span>
            </div>
          ) : availableVoices.length > 0 ? (
            <section className="tts-voice-section" aria-label="音色选择">
              <div className="tts-voiceover__preview-heading">
                <div>
                  <h2>选择音色</h2>
                  <p>当前语言可用 {availableVoices.length} 个音色。</p>
                </div>
              </div>

              <div className="tts-voice-toolbar">
                <label className="tts-voice-search">
                  <Search size={15} strokeWidth={1.8} aria-hidden="true" />
                  <input
                    type="search"
                    value={voiceSearch}
                    placeholder="搜索音色名称"
                    disabled={controlsDisabled}
                    onChange={(event) => setVoiceSearch(event.target.value)}
                  />
                </label>

                <div className="tts-voice-filters" aria-label="音色性别筛选">
                  {voiceFilterOptions.map((option) => (
                    <button
                      className={voiceFilter === option.value ? 'is-active' : ''}
                      key={option.value}
                      type="button"
                      disabled={controlsDisabled}
                      onClick={() => setVoiceFilter(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="tts-voiceover__voice-list" role="radiogroup" aria-label="选择音色">
                {visibleVoices.map((voice) => {
                  const isSelected = voice.id === selectedVoice?.id

                  return (
                    <article
                      className={`tts-voice-card ${isSelected ? 'tts-voice-card--selected' : ''}`}
                      key={voice.id}
                    >
                      <label className="tts-voice-card__main">
                        <input
                          type="radio"
                          name="tts-voice"
                          value={voice.id}
                          checked={isSelected}
                          disabled={controlsDisabled}
                          onChange={() => setVoiceId(voice.id)}
                        />
                        <span
                          className={`tts-voice-card__avatar tts-voice-card__avatar--${voice.gender}`}
                        >
                          {getVoiceInitial(voice)}
                        </span>
                        <span className="tts-voice-card__copy">
                          <strong>{voice.name}</strong>
                          <small>{voice.description}</small>
                        </span>
                        <span className="tts-voice-card__sid">SID {voice.speakerId}</span>
                      </label>
                      <div className="tts-voice-card__actions">
                        <button
                          className="tts-voice-card__preview"
                          type="button"
                          disabled={controlsDisabled || isPreviewing}
                          onClick={() => void handlePreview(voice)}
                        >
                          {isPreviewing ? (
                            <LoaderCircle className="tts-spin" size={15} aria-hidden="true" />
                          ) : (
                            <CirclePlay size={15} strokeWidth={1.8} aria-hidden="true" />
                          )}
                          <span>{isPreviewing ? '生成中' : '试听音色'}</span>
                        </button>
                      </div>
                    </article>
                  )
                })}

                {visibleVoices.length === 0 && (
                  <div className="tts-empty-state tts-empty-state--compact">
                    没有符合筛选条件的音色
                  </div>
                )}
              </div>
            </section>
          ) : (
            <div className="tts-empty-state tts-empty-state--voice">
              <Headphones size={24} strokeWidth={1.6} aria-hidden="true" />
              <strong>当前语言需要安装配音插件</strong>
              <span>前往插件页安装适合当前语言的语音资源。</span>
              {onOpenPlugins && (
                <button className="tts-empty-state__action" type="button" onClick={onOpenPlugins}>
                  <Plug size={15} strokeWidth={1.8} aria-hidden="true" />
                  前往插件
                </button>
              )}
            </div>
          )}

          {isAdvancedOpen && (
            <section className="tts-voiceover__advanced" aria-label="高级设置">
              <label>
                <span>语速</span>
                <select
                  aria-label="语速"
                  value={speed}
                  disabled={controlsDisabled}
                  onChange={(event) => setSpeed(event.target.value)}
                >
                  {speedOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <p>
                <Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />
                试听最多读取开头 220 个字符；正式生成最多支持 100,000 个字符。
              </p>
            </section>
          )}

          {previewUrl && (
            <div className="tts-preview-player">
              <span>试听结果</span>
              <audio controls src={previewUrl} />
            </div>
          )}

          <footer className="tts-voiceover__actions">
            <button
              className="tts-voiceover__advanced-toggle"
              type="button"
              aria-expanded={isAdvancedOpen}
              onClick={() => setIsAdvancedOpen((isOpen) => !isOpen)}
            >
              <SlidersHorizontal size={16} strokeWidth={1.8} aria-hidden="true" />
              <span>高级设置</span>
            </button>

            <button
              className="tts-voiceover__convert"
              type="button"
              disabled={!canGenerate}
              onClick={() => void handleCreateJob()}
            >
              <Play size={15} fill="currentColor" strokeWidth={1.8} aria-hidden="true" />
              <span>开始生成</span>
            </button>
          </footer>
        </aside>
      </div>
    </section>
  )
}

export default TtsVoiceoverView
