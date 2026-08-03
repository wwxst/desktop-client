import { Plus } from 'lucide-react'
import type { JSX } from 'react'
import './SmartEdit.css'

interface SmartEditDraftViewProps {
  onCreateDraft: () => void
}

function SmartEditDraftView({ onCreateDraft }: SmartEditDraftViewProps): JSX.Element {
  return (
    <section className="smart-edit-drafts" aria-label="智剪草稿">
      <button
        className="smart-edit-drafts__create"
        type="button"
        aria-label="新建草稿"
        onClick={onCreateDraft}
      >
        <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
        <span>新建草稿</span>
      </button>
    </section>
  )
}

export default SmartEditDraftView
