import type {
  ChangeEvent,
  DragEvent as ReactDragEvent,
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
  Info,
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
import EditorContextMenu, { type EditorContextMenuItem } from './EditorContextMenu'
import VideoThumbnail from './VideoThumbnail'
import { setEditorAssetDragData } from './editorDnD'
import { formatTimecode } from './editorTime'
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

interface ContextState {
  x: number
  y: number
  asset: MediaAsset
}

function FunctionPanel({ mediaItems, onImportMedia, onAddMedia }: FunctionPanelProps): JSX.Element {
  const [selectedCategory, setSelectedCategory] = useState('媒体')
  const [isDraggingCategories, setIsDraggingCategories] = useState(false)
  const [isFileDragOver, setIsFileDragOver] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextState | null>(null)
  const categoryListRef = useRef<HTMLElement | null>(null)
  const mediaInputRef = useRef<HTMLInputElement | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const dragStartXRef = useRef(0)
  const dragStartScrollLeftRef = useRef(0)
  const suppressClickRef = useRef(false)
  const fileDragDepthRef = useRef(0)

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
    setIsDraggingCategories(true)
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
    setIsDraggingCategories(false)
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

  const handleExternalDragEnter = (event: ReactDragEvent<HTMLDivElement>): void => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    fileDragDepthRef.current += 1
    setIsFileDragOver(true)
  }

  const handleExternalDragLeave = (event: ReactDragEvent<HTMLDivElement>): void => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1)
    if (fileDragDepthRef.current === 0) setIsFileDragOver(false)
  }

  const handleExternalDrop = (event: ReactDragEvent<HTMLDivElement>): void => {
    const files = Array.from(event.dataTransfer.files ?? []).filter((file) =>
      file.type.startsWith('video/')
    )
    if (files.length === 0) return
    event.preventDefault()
    fileDragDepthRef.current = 0
    setIsFileDragOver(false)
    onImportMedia(files)
  }

  const contextItems = (asset: MediaAsset): EditorContextMenuItem[] => [
    {
      id: 'add',
      label: '添加到时间线',
      shortcut: 'Enter',
      icon: <Plus size={14} />,
      disabled: asset.status !== 'ready',
      onSelect: () => onAddMedia(asset.id)
    },
    { id: 'separator-1', separator: true },
    {
      id: 'info',
      label: `${formatTimecode(asset.duration ?? 0)} · ${asset.name}`,
      icon: <Info size={14} />,
      disabled: true
    }
  ]

  return (
    <section className="studio-function-panel" aria-label="功能区">
      <nav
        ref={categoryListRef}
        className="studio-function-panel__categories"
        role="tablist"
        aria-label="功能分类"
        data-dragging={isDraggingCategories}
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
              <Icon size={17} strokeWidth={1.65} aria-hidden="true" />
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
        {selectedCategory === '媒体' ? (
          <div
            className="studio-function-panel__media-library"
            data-file-drag-over={isFileDragOver ? 'true' : undefined}
            onDragEnter={handleExternalDragEnter}
            onDragOver={(event) => {
              if (Array.from(event.dataTransfer.types).includes('Files')) {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'copy'
              }
            }}
            onDragLeave={handleExternalDragLeave}
            onDrop={handleExternalDrop}
          >
            <div className="studio-function-panel__media-toolbar">
              <strong>项目媒体</strong>
              <button
                className="studio-function-panel__media-import"
                type="button"
                onClick={() => mediaInputRef.current?.click()}
              >
                <CirclePlus size={14} strokeWidth={1.8} aria-hidden="true" />
                <span>导入</span>
              </button>
            </div>
            <input
              ref={mediaInputRef}
              className="studio-function-panel__media-file-input"
              type="file"
              accept="video/*"
              multiple
              aria-label="导入媒体"
              onChange={handleMediaImport}
            />

            {mediaItems.length === 0 ? (
              <button
                type="button"
                className="studio-function-panel__empty"
                onClick={() => mediaInputRef.current?.click()}
              >
                <Video size={26} strokeWidth={1.4} aria-hidden="true" />
                <strong>导入或拖入视频</strong>
                <span>导入后可直接拖到下方时间线</span>
              </button>
            ) : (
              <div className="studio-function-panel__media-grid">
                {mediaItems.map((mediaItem) => {
                  const isPreviewReady = mediaItem.status === 'ready'
                  const hasPreviewFailed = mediaItem.status === 'error'
                  return (
                    <article
                      className="studio-function-panel__media-card"
                      key={mediaItem.id}
                      draggable={isPreviewReady}
                      data-ready={isPreviewReady ? 'true' : undefined}
                      onDragStart={(event) => {
                        if (!isPreviewReady) {
                          event.preventDefault()
                          return
                        }
                        setEditorAssetDragData(event.dataTransfer, mediaItem.id)
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        setContextMenu({ x: event.clientX, y: event.clientY, asset: mediaItem })
                      }}
                      onDoubleClick={() => {
                        if (isPreviewReady) onAddMedia(mediaItem.id)
                      }}
                    >
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
                        <VideoThumbnail
                          url={mediaItem.url}
                          enabled={isPreviewReady}
                          className="studio-function-panel__media-preview"
                          alt=""
                        />
                        <button
                          className="studio-function-panel__media-add"
                          type="button"
                          title="添加到时间线"
                          aria-label={`添加${mediaItem.name}`}
                          disabled={!isPreviewReady}
                          onClick={() => onAddMedia(mediaItem.id)}
                        >
                          <Plus size={12} strokeWidth={2} aria-hidden="true" />
                        </button>
                        <span className="studio-function-panel__media-duration">
                          {formatTimecode(mediaItem.duration ?? 0, 0)}
                        </span>
                      </div>
                      <p title={mediaItem.name}>{mediaItem.name}</p>
                    </article>
                  )
                })}
              </div>
            )}

            {isFileDragOver && (
              <div className="studio-function-panel__drop-overlay">
                <Video size={24} aria-hidden="true" />
                <strong>释放以导入视频</strong>
              </div>
            )}
          </div>
        ) : (
          <div className="studio-function-panel__coming-soon">
            <span>{selectedCategory}</span>
            <small>本轮先重构剪辑交互，功能将在后续阶段接入。</small>
          </div>
        )}
      </div>

      {contextMenu && (
        <EditorContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextItems(contextMenu.asset)}
          onClose={() => setContextMenu(null)}
          ariaLabel="素材快捷菜单"
        />
      )}
    </section>
  )
}

export default FunctionPanel
