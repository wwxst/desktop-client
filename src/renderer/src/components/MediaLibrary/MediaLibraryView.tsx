import {
  FileWarning,
  Image as ImageIcon,
  Music2,
  RefreshCw,
  Trash2,
  Upload,
  Video
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import type {
  GlobalMediaAsset,
  GlobalMediaKind,
  GlobalMediaLibraryResponse
} from '../../../../shared/mediaLibrary'
import './MediaLibrary.css'

type MediaFilter = 'all' | GlobalMediaKind

const FILTERS: ReadonlyArray<{ value: MediaFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'image', label: '图片' }
]

const KIND_LABELS: Record<GlobalMediaKind, string> = {
  video: '视频',
  audio: '音频',
  image: '图片'
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
  if (sizeBytes < 1024 * 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatImportDate(importedAt: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(importedAt))
}

function MediaKindIcon({ kind }: { kind: GlobalMediaKind }): JSX.Element {
  if (kind === 'audio') return <Music2 size={24} strokeWidth={1.7} aria-hidden="true" />
  if (kind === 'image') return <ImageIcon size={24} strokeWidth={1.7} aria-hidden="true" />
  return <Video size={24} strokeWidth={1.7} aria-hidden="true" />
}

function MediaLibraryView(): JSX.Element {
  const [assets, setAssets] = useState<GlobalMediaAsset[]>([])
  const [activeFilter, setActiveFilter] = useState<MediaFilter>('all')
  const [activeTag, setActiveTag] = useState('')
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [busyAction, setBusyAction] = useState<'import' | 'refresh' | string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const applyResponse = useCallback((response: GlobalMediaLibraryResponse): void => {
    if (!response.success) {
      setErrorMessage(response.message)
      setLoadState('error')
      return
    }

    setAssets(response.assets)
    setActiveTag((currentTag) =>
      currentTag && !response.assets.some((asset) => asset.tags.includes(currentTag))
        ? ''
        : currentTag
    )
    setErrorMessage('')
    setLoadState('ready')
  }, [])

  useEffect(() => {
    let active = true

    void window.api
      .listGlobalMediaLibrary()
      .then((response) => {
        if (active) applyResponse(response)
      })
      .catch(() => {
        if (!active) return
        setErrorMessage('读取素材库失败，请稍后重试')
        setLoadState('error')
      })

    return () => {
      active = false
    }
  }, [applyResponse])

  const availableTags = useMemo(
    () =>
      [...new Set(assets.flatMap((asset) => asset.tags ?? []))].sort((left, right) =>
        left.localeCompare(right, 'zh-CN')
      ),
    [assets]
  )
  const effectiveActiveTag = activeTag && availableTags.includes(activeTag) ? activeTag : ''
  const filteredAssets = useMemo(
    () =>
      assets.filter((asset) => {
        const matchesKind = activeFilter === 'all' || asset.kind === activeFilter
        const matchesTag = !effectiveActiveTag || (asset.tags ?? []).includes(effectiveActiveTag)
        return matchesKind && matchesTag
      }),
    [activeFilter, effectiveActiveTag, assets]
  )
  const missingCount = assets.filter((asset) => asset.availability === 'missing').length

  const handleRefresh = async (): Promise<void> => {
    setBusyAction('refresh')
    setFeedback('')
    try {
      const response = await window.api.listGlobalMediaLibrary()
      applyResponse(response)
      if (response.success) setFeedback('素材状态已刷新')
    } catch {
      setErrorMessage('读取素材库失败，请稍后重试')
      setLoadState('error')
    } finally {
      setBusyAction(null)
    }
  }

  const handleImport = async (): Promise<void> => {
    setBusyAction('import')
    setFeedback('')
    try {
      const response = await window.api.importGlobalMediaFiles()
      applyResponse(response)
      if (response.success && !response.canceled) setFeedback(response.message)
    } catch {
      setErrorMessage('导入素材失败，请稍后重试')
      setLoadState('error')
    } finally {
      setBusyAction(null)
    }
  }

  const updateTags = (response: GlobalMediaLibraryResponse): void => {
    if (!response.success) {
      setErrorMessage(response.message)
      return
    }
    applyResponse(response)
    setFeedback(response.message)
  }

  const handleAddTag = async (assetId: string, tag: string): Promise<boolean> => {
    const normalizedTag = tag.trim()
    if (!normalizedTag) return false
    setBusyAction(`tag:${assetId}`)
    setFeedback('')
    setErrorMessage('')
    try {
      const response = await window.api.addGlobalMediaTag(assetId, normalizedTag)
      updateTags(response)
      return response.success
    } catch {
      setFeedback('')
      setErrorMessage('更新素材标签失败，请稍后重试')
      return false
    } finally {
      setBusyAction(null)
    }
  }

  const handleRemoveTag = async (assetId: string, tag: string): Promise<void> => {
    setBusyAction(`tag:${assetId}`)
    setFeedback('')
    setErrorMessage('')
    try {
      updateTags(await window.api.removeGlobalMediaTag(assetId, tag))
    } catch {
      setFeedback('')
      setErrorMessage('更新素材标签失败，请稍后重试')
    } finally {
      setBusyAction(null)
    }
  }

  const handleRelocate = async (assetId: string): Promise<void> => {
    setBusyAction(`relocate:${assetId}`)
    setFeedback('')
    setErrorMessage('')
    try {
      const response = await window.api.relocateGlobalMediaAsset(assetId)
      if (!response.success) {
        setErrorMessage(response.message)
        return
      }
      applyResponse(response)
      if (!response.canceled) setFeedback(response.message)
    } catch {
      setFeedback('')
      setErrorMessage('重新定位素材失败，请稍后重试')
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <section className="media-library" aria-label="媒体库">
      <div className="media-library__shell">
        <header className="media-library__header">
          <div>
            <p className="media-library__eyebrow">MEDIA LIBRARY</p>
            <h1>媒体库</h1>
          </div>

          <div className="media-library__actions">
            <button
              type="button"
              className="media-library__refresh"
              aria-label="刷新素材状态"
              title="刷新素材状态"
              disabled={busyAction !== null}
              onClick={() => void handleRefresh()}
            >
              <RefreshCw size={17} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="media-library__import"
              disabled={busyAction !== null}
              onClick={() => void handleImport()}
            >
              <Upload size={17} strokeWidth={1.8} aria-hidden="true" />
              <span>{busyAction === 'import' ? '正在导入' : '导入媒体'}</span>
            </button>
          </div>
        </header>

        <div className="media-library__toolbar">
          <div className="media-library__filters" role="group" aria-label="素材类型筛选">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                aria-pressed={activeFilter === filter.value}
                onClick={() => setActiveFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="media-library__summary" aria-label="素材统计">
            <span>{assets.length} 个素材</span>
            {missingCount > 0 && (
              <span className="media-library__missing-count">{missingCount} 个失效</span>
            )}
          </div>
          <label className="media-library__tag-filter">
            <span>标签</span>
            <select
              aria-label="标签筛选"
              value={effectiveActiveTag}
              onChange={(event) => setActiveTag(event.currentTarget.value)}
            >
              <option value="">全部标签</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
        </div>

        {feedback && (
          <div className="media-library__feedback" role="status">
            {feedback}
          </div>
        )}

        {errorMessage && loadState !== 'error' && (
          <div className="media-library__feedback media-library__feedback--error" role="alert">
            {errorMessage}
          </div>
        )}

        {loadState === 'loading' && (
          <div className="media-library__state" role="status">
            正在加载素材库
          </div>
        )}

        {loadState === 'error' && (
          <div className="media-library__state media-library__state--error" role="alert">
            <FileWarning size={25} strokeWidth={1.7} aria-hidden="true" />
            <strong>{errorMessage}</strong>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleRefresh()}
            >
              重试
            </button>
          </div>
        )}

        {loadState === 'ready' && assets.length === 0 && (
          <div className="media-library__state" role="status">
            <strong>还没有已索引的素材</strong>
          </div>
        )}

        {loadState === 'ready' && assets.length > 0 && filteredAssets.length === 0 && (
          <div className="media-library__state" role="status">
            <strong>没有符合筛选条件的素材</strong>
          </div>
        )}

        {loadState === 'ready' && filteredAssets.length > 0 && (
          <ul className="media-library__grid" aria-label="素材列表">
            {filteredAssets.map((asset) => (
              <li key={asset.id} className="media-library__item">
                <div className={`media-library__preview media-library__preview--${asset.kind}`}>
                  <MediaKindIcon kind={asset.kind} />
                  {asset.availability === 'missing' && (
                    <span className="media-library__availability">
                      <FileWarning size={13} strokeWidth={1.9} aria-hidden="true" />
                      已失效
                    </span>
                  )}
                </div>

                <div className="media-library__details">
                  <strong className="media-library__name" title={asset.name}>
                    {asset.name}
                  </strong>
                  <span className="media-library__metadata">
                    {KIND_LABELS[asset.kind]} · {formatFileSize(asset.sizeBytes)} ·{' '}
                    {formatImportDate(asset.importedAt)}
                  </span>
                  <span className="media-library__path" title={asset.sourcePath}>
                    {asset.sourcePath}
                  </span>
                  <div className="media-library__tags" aria-label={`${asset.name} 标签`}>
                    {(asset.tags ?? []).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="media-library__tag"
                        aria-label={`删除标签 ${tag}`}
                        disabled={busyAction !== null}
                        onClick={() => void handleRemoveTag(asset.id, tag)}
                      >
                        {tag}
                        <Trash2 size={11} aria-hidden="true" />
                      </button>
                    ))}
                    <input
                      className="media-library__tag-input"
                      type="text"
                      aria-label="添加标签"
                      placeholder="添加标签"
                      disabled={busyAction !== null}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return
                        event.preventDefault()
                        const input = event.currentTarget
                        const value = input.value
                        void handleAddTag(asset.id, value).then((success) => {
                          if (success) input.value = ''
                        })
                      }}
                    />
                  </div>
                  {asset.availability === 'missing' && (
                    <button
                      type="button"
                      className="media-library__relocate"
                      disabled={busyAction !== null}
                      onClick={() => void handleRelocate(asset.id)}
                    >
                      {busyAction === `relocate:${asset.id}` ? '正在重新定位' : '重新定位'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default MediaLibraryView
