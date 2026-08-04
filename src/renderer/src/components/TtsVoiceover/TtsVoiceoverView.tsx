import { CirclePlay, Mic2, Play, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useState, type JSX } from 'react'
import muqingAvatar from '../../assets/voices/muqing.jpg'
import wanningAvatar from '../../assets/voices/wanning.jpg'
import yuchenAvatar from '../../assets/voices/yuchen.jpg'
import './TtsVoiceover.css'

const voiceOptions = [
  {
    value: 'muqing',
    name: '1504 - Xx 淼淼-热门推荐通用女声',
    avatar: muqingAvatar,
    quota: '单次最多转换: 3000 字'
  },
  {
    value: 'yuchen',
    name: '349 - Az-阿泽-推荐通用男声（排队转换 + 无限制）',
    avatar: yuchenAvatar,
    quota: '单次最多转换: 3000 字'
  },
  {
    value: 'wanning',
    name: '15041 - Xx 淼淼-热门推荐通用女声 V2 长文版',
    avatar: wanningAvatar,
    quota: '单次最多转换: 10000 字'
  }
]

const speedOptions = [
  { value: '0.8', label: '0.8x' },
  { value: '1', label: '1.0x' },
  { value: '1.2', label: '1.2x' }
]

function TtsVoiceoverView(): JSX.Element {
  const [script, setScript] = useState('')
  const [language, setLanguage] = useState('zh-CN')
  const [voice, setVoice] = useState(voiceOptions[0].value)
  const [speed, setSpeed] = useState(speedOptions[1].value)
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)

  return (
    <section className="tts-voiceover" aria-label="TTS 配音">
      <header className="tts-voiceover__header">
        <div>
          <p className="tts-voiceover__eyebrow">AI AUDIO</p>
          <h1>TTS 配音</h1>
        </div>

        <div className="tts-voiceover__badge" aria-label="配音工具">
          <Mic2 size={20} strokeWidth={1.8} aria-hidden="true" />
          <span>配音工具</span>
        </div>
      </header>

      <div className="tts-voiceover__content">
        <form className="tts-voiceover__composer" onSubmit={(event) => event.preventDefault()}>
          <div className="tts-voiceover__section-heading">
            <div>
              <h2>文本转换</h2>
            </div>
            <span>{script.length}/500</span>
          </div>

          <label className="tts-voiceover__field">
            <span className="sr-only">配音文案</span>
            <textarea
              aria-label="配音文案"
              value={script}
              maxLength={500}
              onChange={(event) => setScript(event.target.value)}
              placeholder="输入想要转换成语音的文字..."
              rows={9}
            />
          </label>

        </form>

        <aside className="tts-voiceover__preview" aria-label="试听预览">
          <div className="tts-voiceover__language-row">
            <label className="tts-voiceover__language-field">
              <span>选择文本语言</span>
              <select
                aria-label="文本语言"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option value="zh-CN">中文 - Chinese 简体和繁体</option>
                <option value="en-US">English - 英语</option>
              </select>
            </label>

          </div>

          <div className="tts-voiceover__preview-heading">
            <div>
              <h2>选择您喜欢的声音</h2>
            </div>
          </div>

          <div className="tts-voiceover__voice-list" role="radiogroup" aria-label="选择音色">
            {voiceOptions.map((voiceOption, index) => {
              const isSelected = voiceOption.value === voice

              return (
                <article
                  className={`tts-voice-card ${isSelected ? 'tts-voice-card--selected' : ''}`}
                  key={voiceOption.value}
                >
                  <label className="tts-voice-card__main">
                    <input
                      type="radio"
                      name="tts-voice"
                      value={voiceOption.value}
                      checked={isSelected}
                      onChange={() => setVoice(voiceOption.value)}
                      aria-label={`${index + 1}. ${voiceOption.name}`}
                    />
                    <img src={voiceOption.avatar} alt={`${voiceOption.name} 音色头像`} />
                    <strong title={voiceOption.name}>{voiceOption.name}</strong>
                  </label>

                  <div className="tts-voice-card__footer">
                    <button type="button" disabled>
                      <CirclePlay size={15} strokeWidth={1.8} aria-hidden="true" />
                      <span>试听音色</span>
                    </button>
                    <span>
                      <Sparkles size={12} strokeWidth={1.8} aria-hidden="true" />
                      {voiceOption.quota}
                    </span>
                  </div>
                </article>
              )
            })}
          </div>

          {isAdvancedOpen && (
            <section className="tts-voiceover__advanced" aria-label="高级设置">
              <label>
                <span>语速</span>
                <select
                  aria-label="语速"
                  value={speed}
                  onChange={(event) => setSpeed(event.target.value)}
                >
                  {speedOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </section>
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
            <button className="tts-voiceover__convert" type="button" disabled>
              <Play size={15} fill="currentColor" strokeWidth={1.8} aria-hidden="true" />
              <span>开始转换</span>
            </button>
          </footer>
        </aside>
      </div>
    </section>
  )
}

export default TtsVoiceoverView
