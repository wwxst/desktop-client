import type {
  ChangeEvent,
  JSX,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent
} from 'react'
import { useRef, useState } from 'react'
import {
  ArrowRightLeft,
  CirclePlus,
  Filter,
  Image,
  LayoutTemplate,
  Music2,
  Plus,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Type,
  Video,
  VideoOff,
  type LucideIcon
} from 'lucide-react'
import type { MediaAsset } from './editorProject'
import './FunctionPanel.css'

interface FunctionTool {
  label: string
  icon: LucideIcon
}

interface FunctionPanelProps {
  mediaItems: MediaAsset[]
  onImportMedia: (files: readonly File[]) => void
  onAddMedia: (mediaId: string) => void
}

const functionTools: FunctionTool[] = [
  { label: '媒体', icon: Image },
  { label: '音频', icon: Music2 },
  { label: '文本', icon: Type },
  { label: '贴纸', icon: Smile },
  { label: '特效', icon: Sparkles },
  { label: '转场', icon: ArrowRightLeft },
  { label: '滤镜', icon: Filter },
  { label: '调节', icon: SlidersHorizontal },
  { label: '模板', icon: LayoutTemplate }
]

const formatDuration = (duration: number | null): string => {
  if (duration === null || !Number.isFinite(duration)) return '--:--'

  const totalSeconds = Math.max(0, Math.floor(duration))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const minuteText = String(minutes).padStart(2, '0')
  const secondText = String(seconds).padStart(2, '0')

  return hours > 0 ? `${hours}:${minuteText}:${secondText}` : `${minuteText}:${secondText}`
}

function FunctionPanel({
  mediaItems,
  onImportMedia,
  onAddMedia
}: FunctionPanelProps): JSX.Element {
  const [selectedCategory, setSelectedCategory] = useState('媒体')
  const [isDragging, setIsDragging] = useState(false)
  const categoryListRef = useRef<HTMLElement | null>(null)
  const mediaInputRef = useRef<HTMLInputElement | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const dragStartXRef = useRef(0)
  const dragStartScrollLeftRef = useRef(0)
  const suppressClickRef = useRef(false)

  const handleMediaImport = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.currentTarget.files ?? [])
    if (files.length === 0) return

    onImportMedia(files)
    event.currentTarget.value = ''
  }

  const handleCategoryPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return

    const categoryList = categoryListRef.current
    if (!categoryList) return

    activePointerIdRef.current = event.pointerId
    dragStartXRef.current = event.clientX
    dragStartScrollLeftRef.current = categoryList.scrollLeft
    suppressClickRef.current = false
    setIsDragging(true)
    categoryList.setPointerCapture(event.pointerId)
  }

  const handleCategoryPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    if (activePointerIdRef.current !== event.pointerId) return

    const categoryList = categoryListRef.current
    if (!categoryList) return

    const dragDistance = event.clientX - dragStartXRef.current
    if (Math.abs(dragDistance) > 4) {
      suppressClickRef.current = true
      event.preventDefault()
    }

    categoryList.scrollLeft = dragStartScrollLeftRef.current - dragDistance
  }

  const handleCategoryPointerUp = (event: ReactPointerEvent<HTMLElement>): void => {
    if (activePointerIdRef.current !== event.pointerId) return

    const categoryList = categoryListRef.current
    if (categoryList?.hasPointerCapture(event.pointerId)) {
      categoryList.releasePointerCapture(event.pointerId)
    }

    activePointerIdRef.current = null
    setIsDragging(false)
  }

  const handleCategoryWheel = (event: ReactWheelEvent<HTMLElement>): void => {
    const categoryList = categoryListRef.current
    if (!categoryList || categoryList.scrollWidth <= categoryList.clientWidth) return

    const scrollDistance =
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (scrollDistance === 0) return

    event.preventDefault()
    categoryList.scrollLeft += scrollDistance
  }

  return (
    <section className="studio-function-panel" aria-label="功能区">
      <nav
        ref={categoryListRef}
        className="studio-function-panel__categories"
        role="tablist"
        aria-label="功能分类"
        data-dragging={isDragging}
        onPointerDown={handleCategoryPointerDown}
        onPointerMove={handleCategoryPointerMove}
        onPointerUp={handleCategoryPointerUp}
        onPointerCancel={handleCategoryPointerUp}
        onWheel={handleCategoryWheel}
      >
        {functionTools.map((tool) => {
          const Icon = tool.icon

          return (
            <button
              key={tool.label}
              type="button"
              role="tab"
              aria-selected={selectedCategory === tool.label}
              aria-controls="studio-function-panel-content"
              onClick={() => {
                if (suppressClickRef.current) {
                  suppressClickRef.current = false
                  return
                }

                setSelectedCategory(tool.label)
              }}
            >
              <Icon size={18} strokeWidth={1.65} aria-hidden="true" />
              <span>{tool.label}</span>
            </button>
          )
        })}
      </nav>

      <div
        id="studio-function-panel-content"
        className="studio-function-panel__content"
        role="tabpanel"
        aria-label={`${selectedCategory}内容`}
      >
        {selectedCategory === '媒体' && (
          <div className="studio-function-panel__media-library">
            <button
              className="studio-function-panel__media-import"
              type="button"
              onClick={() => mediaInputRef.current?.click()}
            >
              <CirclePlus size={14} strokeWidth={1.8} aria-hidden="true" />
              <span>导入</span>
            </button>
            <input
              ref={mediaInputRef}
              className="studio-function-panel__media-file-input"
              type="file"
              accept="video/*"
              multiple
              aria-label="导入媒体"
              onChange={handleMediaImport}
            />

            <h3>全部</h3>

            <div className="studio-function-panel__media-grid">
              {mediaItems.map((mediaItem) => {
                const isPreviewReady = mediaItem.status === 'ready'
                const hasPreviewFailed = mediaItem.status === 'error'

                return (
                  <article className="studio-function-panel__media-card" key={mediaItem.id}>
                    <div className="studio-function-panel__media-thumbnail">
                      <div
                        className="studio-function-panel__media-placeholder"
                        data-error={hasPreviewFailed}
                        aria-hidden={!hasPreviewFailed}
                      >
                        {hasPreviewFailed ? (
                          <>
                            <VideoOff size={18} strokeWidth={1.5} aria-hidden="true" />
                            <span>无法预览</span>
                          </>
                        ) : (
                          <Video size={20} strokeWidth={1.4} aria-hidden="true" />
                        )}
                      </div>
                      <video
                        src={mediaItem.url}
                        muted
                        playsInline
                        preload="auto"
                        data-ready={isPreviewReady}
                        aria-label={`${mediaItem.name}预览`}
                      />
                      <button
                        className="studio-function-panel__media-add"
                        type="button"
                        title="添加媒体"
                        aria-label={`添加${mediaItem.name}`}
                        disabled={mediaItem.status !== 'ready'}
                        onClick={() => onAddMedia(mediaItem.id)}
                      >
                        <Plus size={11} strokeWidth={2} aria-hidden="true" />
                        <span>添加</span>
                      </button>
                      <span className="studio-function-panel__media-duration">
                        {formatDuration(mediaItem.duration)}
                      </span>
                    </div>
                    <p title={mediaItem.name}>{mediaItem.name}</p>
                  </article>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export default FunctionPanel
