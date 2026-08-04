import { Download } from 'lucide-react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Button from '../src/renderer/src/components/ui/Button'

describe('Button', () => {
  it('renders a native button with the requested variant, size, and icon', () => {
    render(
      <Button variant="secondary" size="sm" icon={<Download data-testid="button-icon" />}>
        安装
      </Button>
    )

    const button = screen.getByRole('button', { name: '安装' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveClass('ui-button--secondary', 'ui-button--sm')
    expect(screen.getByTestId('button-icon')).toBeInTheDocument()
  })

  it('disables the button and reports busy state while loading', () => {
    render(<Button loading>安装</Button>)

    const button = screen.getByRole('button', { name: '安装' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})
