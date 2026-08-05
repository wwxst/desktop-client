import { Upload } from 'lucide-react'
import type { JSX } from 'react'
import './MediaLibrary.css'

function MediaLibraryView(): JSX.Element {
  return (
    <section className="media-library" aria-label="媒体库">
      <div className="media-library__shell">
        <header className="media-library__header">
          <p className="media-library__eyebrow">MEDIA LIBRARY</p>
          <h1>媒体库</h1>
        </header>

        <div className="media-library__actions">
          <button
            type="button"
            className="media-library__import"
            disabled
            title="媒体导入功能即将支持"
          >
            <Upload size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>导入媒体</span>
          </button>
        </div>

        <div className="media-library__empty" role="status">
          <strong>媒体库还是空的</strong>
          <span>导入图片、视频或音频后，会集中显示在这里。</span>
        </div>
      </div>
    </section>
  )
}

export default MediaLibraryView
