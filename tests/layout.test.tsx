import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Layout from '../src/renderer/src/layouts/Layout'

describe('Layout', () => {
  it('renders three regions with accessible resize handles', () => {
    render(
      <Layout
        sidebar={<span>left region</span>}
        content={<span>center region</span>}
        rightPanel={<span>right region</span>}
      />
    )

    const complementaryRegions = screen.getAllByRole('complementary')
    expect(complementaryRegions).toHaveLength(2)
    expect(within(complementaryRegions[0]).getByText('left region')).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByText('center region')).toBeInTheDocument()
    expect(within(complementaryRegions[1]).getByText('right region')).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: '调整左侧栏宽度' })).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: '调整右侧栏宽度' })).toBeInTheDocument()
  })

  it('can render the focused two-column layout without a right panel', () => {
    render(<Layout sidebar={<span>left region</span>} content={<span>center region</span>} />)

    expect(screen.getAllByRole('complementary')).toHaveLength(1)
    expect(screen.queryByRole('separator', { name: '调整右侧栏宽度' })).not.toBeInTheDocument()
  })
})
