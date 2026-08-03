import type { JSX } from 'react'
import './ParameterPanel.css'

function ParameterPanel(): JSX.Element {
  return (
    <section className="studio-parameter-panel" aria-label="参数区">
      <header className="studio-workspace__panel-header">
        <h2>参数区</h2>
      </header>

      <div className="studio-parameter-panel__content" />
    </section>
  )
}

export default ParameterPanel
