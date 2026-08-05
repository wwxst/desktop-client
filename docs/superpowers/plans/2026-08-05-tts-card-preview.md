# TTS Card Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move TTS preview into each dynamic voice card, automatically play generated audio, reuse matching previews, and keep the two footer actions on one row.

**Architecture:** Keep the existing main-process `tts:preview` IPC contract unchanged. Refactor `TtsVoiceoverView` so preview requests receive the clicked `TtsVoice` explicitly, while renderer-owned refs manage one `HTMLAudioElement`, one object URL, and a request-signature cache. Keep the selected voice state independent from preview state.

**Tech Stack:** React 19, TypeScript, Electron preload IPC, Lucide React, Vitest, Testing Library, CSS.

---

### Task 1: Move the preview command into each voice card

**Files:**
- Modify: `tests/tts-voice-selection.test.tsx`
- Modify: `tests/tts-preview-samples.test.tsx`
- Modify: `src/renderer/src/components/TtsVoiceover/TtsVoiceoverView.tsx`

- [ ] **Step 1: Write failing tests for card-specific preview**

In `tests/tts-voice-selection.test.tsx`, replace the old global-preview interaction with:

~~~tsx
const radios = await screen.findAllByRole('radio')
expect(radios).toHaveLength(2)
expect(radios[0]).toBeChecked()

const previewButtons = screen.getAllByRole('button', { name: '试听音色' })
await user.click(previewButtons[1])

expect(radios[0]).toBeChecked()
expect(radios[1]).not.toBeChecked()

await waitFor(() => {
  expect(previewTts).toHaveBeenCalledWith(
    expect.objectContaining({
      modelId: 'resource-two',
      voiceId: 'resource-two:voice-two'
    })
  )
})
~~~

In `tests/tts-preview-samples.test.tsx`, replace the old query with:

~~~tsx
const previewButton = await screen.findByRole('button', { name: '试听音色' })
~~~

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

~~~powershell
npx vitest run tests/tts-voice-selection.test.tsx tests/tts-preview-samples.test.tsx
~~~

Expected: FAIL because the current UI has one global `试听` command and no per-card `试听音色` buttons.

- [ ] **Step 3: Let preview request a specific voice**

Change request construction in `TtsVoiceoverView.tsx`:

~~~tsx
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

  if (!request) return

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
      if (currentUrl) URL.revokeObjectURL(currentUrl)
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
~~~

- [ ] **Step 4: Render valid card selection and action regions**

Replace the whole-card `label` with this structure:

~~~tsx
<article
  className={isSelected ? 'tts-voice-card tts-voice-card--selected' : 'tts-voice-card'}
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
    <span className={'tts-voice-card__avatar tts-voice-card__avatar--' + voice.gender}>
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
      <CirclePlay size={15} strokeWidth={1.8} aria-hidden="true" />
      <span>{isPreviewing ? '生成中' : '试听音色'}</span>
    </button>
  </div>
</article>
~~~

Remove the footer's global preview button. Keep the old result handling only until Task 2.

- [ ] **Step 5: Run focused tests and confirm GREEN**

~~~powershell
npx vitest run tests/tts-voice-selection.test.tsx tests/tts-preview-samples.test.tsx
~~~

Expected: PASS; clicking a card preview uses that card's model and voice without changing the selected radio.

- [ ] **Step 6: Commit**

~~~powershell
git add tests/tts-voice-selection.test.tsx tests/tts-preview-samples.test.tsx src/renderer/src/components/TtsVoiceover/TtsVoiceoverView.tsx
git commit -m "feat: move TTS preview into voice cards"
~~~

### Task 2: Automatically play and cache preview audio

**Files:**
- Create: `tests/tts-card-preview.test.tsx`
- Modify: `src/renderer/src/components/TtsVoiceover/TtsVoiceoverView.tsx`

- [ ] **Step 1: Create media mocks and a successful two-voice fixture**

Start `tests/tts-card-preview.test.tsx` with:

~~~tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TtsVoiceoverView from '../src/renderer/src/components/TtsVoiceover/TtsVoiceoverView'

const previewTts = vi.fn()
const play = vi.fn().mockResolvedValue(undefined)
const pause = vi.fn()
const createObjectURL = vi.fn(() => 'blob:tts-preview')
const revokeObjectURL = vi.fn()

beforeEach(() => {
  previewTts.mockReset()
  play.mockClear()
  pause.mockClear()
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  previewTts.mockResolvedValue({
    success: true,
    message: '试听已生成',
    audioBytes: new Uint8Array([1, 2, 3]),
    mimeType: 'audio/wav',
    durationSeconds: 1
  })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause)
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: createObjectURL
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: revokeObjectURL
  })
})
~~~

Add this complete local fixture:

~~~tsx
function installTtsApi(): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      listTtsCatalog: vi.fn().mockResolvedValue({
        success: true,
        message: '本地语音资源读取成功',
        languages: [{ code: 'zh-CN', name: '中文', englishName: 'Chinese' }],
        models: [
          {
            id: 'resource-one',
            name: '资源一',
            description: '第一组测试资源',
            engine: 'kokoro',
            licenseName: 'Test',
            licenseNote: 'Test',
            languages: ['zh-CN'],
            voiceCount: 1,
            estimatedDownloadMb: 1,
            status: 'installed',
            statusMessage: '已安装',
            voices: [
              {
                id: 'resource-one:voice-one',
                modelId: 'resource-one',
                speakerId: 0,
                name: '第一音色',
                originalName: 'voice_one',
                languageCodes: ['zh-CN'],
                gender: 'female',
                description: '第一组音色'
              }
            ]
          },
          {
            id: 'resource-two',
            name: '资源二',
            description: '第二组测试资源',
            engine: 'kokoro',
            licenseName: 'Test',
            licenseNote: 'Test',
            languages: ['zh-CN'],
            voiceCount: 1,
            estimatedDownloadMb: 1,
            status: 'installed',
            statusMessage: '已安装',
            voices: [
              {
                id: 'resource-two:voice-two',
                modelId: 'resource-two',
                speakerId: 1,
                name: '第二音色',
                originalName: 'voice_two',
                languageCodes: ['zh-CN'],
                gender: 'male',
                description: '第二组音色'
              }
            ]
          }
        ],
        modelDirectory: 'C:\\tts-models'
      }),
      previewTts,
      onTtsJobProgress: vi.fn(() => vi.fn())
    }
  })
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}
~~~

- [ ] **Step 2: Test automatic playback and matching-cache reuse**

~~~tsx
it('plays a generated card preview immediately and reuses an unchanged preview', async () => {
  installTtsApi()
  const user = userEvent.setup()
  render(<TtsVoiceoverView />)

  const previewButtons = await screen.findAllByRole('button', { name: '试听音色' })
  await user.click(previewButtons[1])

  await waitFor(() => expect(play).toHaveBeenCalledOnce())
  expect(document.querySelector('audio')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '播放中' }))

  await waitFor(() => expect(play).toHaveBeenCalledTimes(2))
  expect(previewTts).toHaveBeenCalledOnce()
  expect(pause).toHaveBeenCalled()
})
~~~

- [ ] **Step 3: Test independence, switching, and invalidation**

~~~tsx
it('keeps selection independent and invalidates cache after input changes', async () => {
  installTtsApi()
  const user = userEvent.setup()
  render(<TtsVoiceoverView />)

  const radios = await screen.findAllByRole('radio')
  const buttons = screen.getAllByRole('button', { name: '试听音色' })

  await user.click(buttons[1])
  await waitFor(() => expect(play).toHaveBeenCalledOnce())
  expect(radios[0]).toBeChecked()
  expect(radios[1]).not.toBeChecked()

  await user.click(screen.getByRole('button', { name: '试听音色' }))
  await waitFor(() => expect(previewTts).toHaveBeenCalledTimes(2))
  expect(pause).toHaveBeenCalled()

  fireEvent.change(screen.getByRole('textbox', { name: '配音文案' }), {
    target: { value: '新的试听文案' }
  })
  await user.click(screen.getAllByRole('button', { name: '试听音色' })[0])
  await waitFor(() => expect(previewTts).toHaveBeenCalledTimes(3))
})
~~~

- [ ] **Step 4: Test card-specific pending state**

~~~tsx
it('shows generation on the clicked card and blocks concurrent previews', async () => {
  const pending = deferred<Awaited<ReturnType<typeof window.api.previewTts>>>()
  previewTts.mockReturnValueOnce(pending.promise)
  installTtsApi()
  const user = userEvent.setup()
  render(<TtsVoiceoverView />)

  const buttons = await screen.findAllByRole('button', { name: '试听音色' })
  await user.click(buttons[1])

  expect(screen.getByRole('button', { name: '生成中' })).toBeDisabled()
  const previewButtons = screen.getAllByRole('button', { name: /试听音色|生成中/ })
  expect(previewButtons.every((item) => (item as HTMLButtonElement).disabled)).toBe(true)

  pending.resolve({ success: false, message: '停止测试等待' })
  await waitFor(() => expect(screen.queryByRole('button', { name: '生成中' })).not.toBeInTheDocument())
})
~~~

- [ ] **Step 5: Run the new test and confirm RED**

~~~powershell
npx vitest run tests/tts-card-preview.test.tsx
~~~

Expected: FAIL because preview audio still requires visible controls and there is no playback cache or card-specific state.

- [ ] **Step 6: Replace URL state with explicit playback refs**

Import `useRef`, add:

~~~tsx
interface PreviewCache {
  signature: string
  url: string
}

const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null)
const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
const previewAudioRef = useRef<HTMLAudioElement | null>(null)
const previewCacheRef = useRef<PreviewCache | null>(null)
const previewEpochRef = useRef(0)
const isPreviewMountedRef = useRef(true)
~~~

Remove `isPreviewing`, `previewUrl`, the visible `tts-preview-player`, and the old URL cleanup effect.

- [ ] **Step 7: Implement playback lifecycle helpers**

~~~tsx
const stopPreviewPlayback = (): void => {
  const audio = previewAudioRef.current
  if (audio) {
    audio.pause()
    audio.currentTime = 0
  }
  setPlayingVoiceId(null)
}

const releasePreviewCache = (): void => {
  if (previewCacheRef.current) {
    URL.revokeObjectURL(previewCacheRef.current.url)
    previewCacheRef.current = null
  }
}

const playPreviewUrl = async (url: string, voice: TtsVoice): Promise<boolean> => {
  const audio = previewAudioRef.current ?? new Audio()
  previewAudioRef.current = audio
  audio.onended = () => isPreviewMountedRef.current && setPlayingVoiceId(null)
  audio.onerror = () => isPreviewMountedRef.current && setPlayingVoiceId(null)
  audio.pause()
  audio.currentTime = 0
  audio.src = url

  try {
    await audio.play()
    if (isPreviewMountedRef.current) setPlayingVoiceId(voice.id)
    return true
  } catch {
    if (isPreviewMountedRef.current) {
      setPlayingVoiceId(null)
      setNotice({ type: 'error', text: '试听播放失败' })
    }
    return false
  }
}
~~~

Add an unmount cleanup effect that increments the epoch, stops and detaches audio, and revokes the cached URL. Add a `[script, language, speed]` invalidation effect that increments the epoch, stops playback, and releases the cache.

- [ ] **Step 8: Implement cached preview and stale-response protection**

Use `JSON.stringify(request)` as the signature. The handler must:

1. Return while `previewingVoiceId` is non-null.
2. Stop current playback.
3. Replay the cached URL when the signature matches.
4. Capture `previewEpochRef.current` before invoking IPC.
5. Set `previewingVoiceId` to the clicked voice ID.
6. Ignore responses after unmount or after the epoch changes.
7. Revoke the old cache, create/cache a new object URL, and call `playPreviewUrl`.
8. Clear `previewingVoiceId` in `finally` only while mounted.

In each card derive:

~~~tsx
const isVoicePreviewing = previewingVoiceId === voice.id
const isVoicePlaying = playingVoiceId === voice.id
const previewBusy = previewingVoiceId !== null

<button
  className="tts-voice-card__preview"
  type="button"
  data-playing={isVoicePlaying}
  disabled={controlsDisabled || previewBusy}
  onClick={() => void handlePreview(voice)}
>
  {isVoicePreviewing ? (
    <LoaderCircle className="tts-spin" size={15} aria-hidden="true" />
  ) : (
    <CirclePlay size={15} strokeWidth={1.8} aria-hidden="true" />
  )}
  <span>{isVoicePreviewing ? '生成中' : isVoicePlaying ? '播放中' : '试听音色'}</span>
</button>
~~~

This renders `生成中`, `播放中`, or `试听音色` and disables every preview button while `previewBusy` or formal generation is active.

- [ ] **Step 9: Run preview tests and confirm GREEN**

~~~powershell
npx vitest run tests/tts-card-preview.test.tsx tests/tts-voice-selection.test.tsx tests/tts-preview-samples.test.tsx
~~~

Expected: PASS for automatic playback, cache reuse, invalidation, card-specific state, and selection independence.

- [ ] **Step 10: Commit**

~~~powershell
git add tests/tts-card-preview.test.tsx src/renderer/src/components/TtsVoiceover/TtsVoiceoverView.tsx
git commit -m "feat: autoplay and cache TTS voice previews"
~~~

### Task 3: Match the approved card and footer layout

**Files:**
- Modify: `src/renderer/src/components/TtsVoiceover/TtsVoiceover.css`
- Modify: `tests/tts-card-preview.test.tsx`

- [ ] **Step 1: Add a failing footer structure assertion**

Give the footer `role="group" aria-label="配音操作"` and assert:

~~~tsx
const footer = screen.getByRole('group', { name: '配音操作' })
expect(within(footer).getByRole('button', { name: '高级设置' })).toBeInTheDocument()
expect(within(footer).getByRole('button', { name: '开始生成' })).toBeInTheDocument()
expect(within(footer).queryByRole('button', { name: /试听/ })).not.toBeInTheDocument()
~~~

- [ ] **Step 2: Run the structural test and confirm RED if old controls remain**

~~~powershell
npx vitest run tests/tts-card-preview.test.tsx
~~~

Expected: FAIL until the old global preview command and visible player are fully absent.

- [ ] **Step 3: Style the approved two-area voice card**

~~~css
.tts-voice-card {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 9px 10px;
  background: #ffffff;
  border: 1px solid #dfe4ea;
  border-radius: 8px;
}

.tts-voice-card__main {
  display: grid;
  grid-template-columns: 17px 36px minmax(0, 1fr) auto;
  gap: 9px;
  align-items: center;
  min-width: 0;
  cursor: pointer;
}

.tts-voice-card__actions {
  display: flex;
  padding-left: 62px;
}

.tts-voice-card__preview {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  min-height: 26px;
  padding: 0;
  color: #1477d4;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  background: transparent;
  border: 0;
}
~~~

Add the complete interaction states while keeping the existing selected-card colors:

~~~css
.tts-voice-card__preview:hover:not(:disabled),
.tts-voice-card__preview:focus-visible,
.tts-voice-card__preview[data-playing='true'] {
  color: #0f5fae;
}

.tts-voice-card__preview:focus-visible {
  outline: 2px solid #1477d4;
  outline-offset: 2px;
}

.tts-voice-card__preview:disabled {
  cursor: default;
  opacity: 0.55;
}
~~~

- [ ] **Step 4: Keep the two footer actions on one row**

Set:

~~~css
.tts-voiceover__actions {
  grid-template-columns: 115px minmax(120px, 1fr);
}
~~~

Remove `.tts-voiceover__preview-button` and `.tts-preview-player` rules. In both container queries preserve:

~~~css
.tts-voiceover__actions {
  grid-template-columns: 115px minmax(0, 1fr);
}
~~~

Remove the narrow-layout rule that made `开始生成` occupy a separate row.

- [ ] **Step 5: Run focused verification**

~~~powershell
npx vitest run tests/tts-card-preview.test.tsx tests/tts-voice-selection.test.tsx tests/tts-preview-samples.test.tsx tests/workspace-view.test.tsx
npm run lint -- --quiet
npm run typecheck
~~~

Expected: all focused tests pass, ESLint exits 0, and both TypeScript projects pass.

- [ ] **Step 6: Commit**

~~~powershell
git add src/renderer/src/components/TtsVoiceover/TtsVoiceover.css tests/tts-card-preview.test.tsx src/renderer/src/components/TtsVoiceover/TtsVoiceoverView.tsx
git commit -m "style: refine TTS voice card preview layout"
~~~

### Task 4: Verify the complete application

**Files:**
- Verify only; no planned source changes.

- [ ] **Step 1: Run all tests**

~~~powershell
npm test
~~~

Expected: every Vitest suite passes.

- [ ] **Step 2: Run static checks and production build**

~~~powershell
npm run lint -- --quiet
npm run typecheck
npm run build
git diff --check
~~~

Expected: every command exits 0 and `git diff --check` reports no whitespace errors.

- [ ] **Step 3: Inspect final repository state**

~~~powershell
git status --short --branch
git log -5 --oneline
~~~

Expected: the worktree is clean and implementation commits follow the design and plan commits.


