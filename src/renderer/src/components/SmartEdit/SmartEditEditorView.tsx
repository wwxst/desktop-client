import { ArrowLeft } from 'lucide-react'
import type { JSX } from 'react'
import VideoEditorWorkspace from './VideoEditorWorkspace/VideoEditorWorkspace'
import './SmartEdit.css'

interface SmartEditEditorViewProps {
  onReturnToDrafts: () => void
}

function SmartEditEditorView({ onReturnToDrafts }: SmartEditEditorViewProps): JSX.Element {
  return (
    <section className="smart-edit-editor" aria-label="智剪编辑器">
      <header className="smart-edit-editor__toolbar">
        <button
          className="smart-edit-editor__back"
          type="button"
          aria-label="返回草稿"
          onClick={onReturnToDrafts}
        >
          <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />
          <span>返回草稿</span>
        </button>
      </header>

      <div className="smart-edit-editor__workspace">
        <VideoEditorWorkspace />
      </div>
    </section>
  )
}

export default SmartEditEditorView
