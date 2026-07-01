import { describe, expect, it, vi, afterEach } from 'vitest'
import { detectPlatform, isMac } from '@/features/titlebar/platform'

describe('titlebar platform detection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('detects mac via navigator.platform', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh)' })
    expect(detectPlatform()).toBe('mac')
    expect(isMac()).toBe(true)
  })

  it('detects windows via userAgent', () => {
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })
    expect(detectPlatform()).toBe('win')
    expect(isMac()).toBe(false)
  })

  it('detects linux (excluding android) via userAgent', () => {
    vi.stubGlobal('navigator', { platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })
    expect(detectPlatform()).toBe('linux')
    expect(isMac()).toBe(false)
  })

  it('classifies android as linux ua but is still not mac/win', () => {
    // Android UA 含 "Linux" 但我们只关心 win/mac/linux 三分；这里确保 Android 不误判为 win/mac
    vi.stubGlobal('navigator', { platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 13)' })
    const p = detectPlatform()
    expect(p === 'win' || p === 'mac').toBe(false)
  })

  it('returns linux as default fallback', () => {
    vi.stubGlobal('navigator', { platform: '', userAgent: '' })
    expect(detectPlatform()).toBe('linux')
  })
})
