import { vi } from 'vitest'

// Mock ResizeObserver for DashboardMockup
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// Mock window.scrollTo
window.scrollTo = vi.fn()

// Mock Clipboard API
if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
    writable: true,
    configurable: true,
  })
} else {
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
}

// Mock window.location.href redirection tracking
const locationMock = {
  href: 'http://localhost/',
  hash: '',
  pathname: '/',
  origin: 'http://localhost',
  assign: vi.fn((url: string) => {
    locationMock.href = url
  }),
  replace: vi.fn((url: string) => {
    locationMock.href = url
  }),
}

try {
  Object.defineProperty(window, 'location', {
    value: locationMock,
    writable: true,
    configurable: true,
  })
} catch {
  // Ignore if unable to redefine
}
