import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => cleanup())

class ResizeObserverMock implements ResizeObserver {
  observe(): void {
    return undefined
  }
  unobserve(): void {
    return undefined
  }
  disconnect(): void {
    return undefined
  }
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverMock
}

Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value: vi.fn()
})

Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
  configurable: true,
  value: vi.fn(() => false)
})

Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
  configurable: true,
  value: vi.fn()
})

Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
  configurable: true,
  value: vi.fn()
})
