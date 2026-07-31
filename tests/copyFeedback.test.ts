import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyAnnouncement, copyButtonProps, createFlash, pickColor, writeToClipboard, type CopyState } from '../app/utils/copyFeedback'

describe('writeToClipboard', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('writes the text and returns true', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await writeToClipboard('hi')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hi')
  })

  it('returns false for empty text without touching the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await writeToClipboard('')).toBe(false)
    expect(writeText).not.toHaveBeenCalled()
  })

  it('returns false when the clipboard API is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    expect(await writeToClipboard('x')).toBe(false)
  })

  it('returns false when the write rejects', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('denied')) } })
    expect(await writeToClipboard('x')).toBe(false)
  })
})

describe('createFlash', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sets the state then resets to idle after the duration', () => {
    const state = { value: 'idle' as CopyState }
    const { flash } = createFlash(state, 1000)
    flash('ok')
    expect(state.value).toBe('ok')
    vi.advanceTimersByTime(999)
    expect(state.value).toBe('ok')
    vi.advanceTimersByTime(1)
    expect(state.value).toBe('idle')
  })

  it('coalesces rapid flashes onto a single timer', () => {
    const state = { value: 'idle' as CopyState }
    const { flash } = createFlash(state, 1000)
    flash('ok')
    vi.advanceTimersByTime(800)
    flash('err') // restarts the timer
    vi.advanceTimersByTime(800)
    expect(state.value).toBe('err')
    vi.advanceTimersByTime(200)
    expect(state.value).toBe('idle')
  })

  it('dispose cancels a pending reset', () => {
    const state = { value: 'idle' as CopyState }
    const { flash, dispose } = createFlash(state, 1000)
    flash('ok')
    dispose()
    vi.advanceTimersByTime(5000)
    expect(state.value).toBe('ok')
  })

  it('dispose is a safe no-op when nothing is pending', () => {
    const state = { value: 'idle' as CopyState }
    const { dispose } = createFlash(state, 1000)
    expect(() => dispose()).not.toThrow()
    expect(state.value).toBe('idle')
  })
})

describe('pickColor', () => {
  it('returns the active colour only while flashing on the matching key', () => {
    expect(pickColor('USD', 'ok', 'USD', 'g', 'r', 'n')).toBe('g')
    expect(pickColor('USD', 'err', 'USD', 'g', 'r', 'n')).toBe('r')
    expect(pickColor('USD', 'idle', 'USD', 'g', 'r', 'n')).toBe('n') // reset → neutral
    expect(pickColor('USD', 'ok', 'EUR', 'g', 'r', 'n')).toBe('n') // other row
    expect(pickColor(null, 'ok', 'USD', 'g', 'r', 'n')).toBe('n') // nothing copied yet
  })
})

describe('copyButtonProps', () => {
  it('idle → neutral colour + the caller-supplied label', () => {
    expect(copyButtonProps('idle', 'Скопировать сумму прописью')).toEqual({
      color: 'air-tertiary-no-accent',
      ariaLabel: 'Скопировать сумму прописью'
    })
  })

  it('ok/err → status colour + fixed RU feedback label (ignores idle label)', () => {
    expect(copyButtonProps('ok', 'X')).toEqual({ color: 'air-primary-success', ariaLabel: 'Скопировано' })
    expect(copyButtonProps('err', 'X')).toEqual({ color: 'air-primary-alert', ariaLabel: 'Не удалось скопировать' })
  })
})

describe('copyAnnouncement (#169)', () => {
  it('announces the outcome and clears on idle', () => {
    expect(copyAnnouncement('ok', 'Скопировано', 'Ошибка')).toBe('Скопировано')
    expect(copyAnnouncement('err', 'Скопировано', 'Ошибка')).toBe('Ошибка')
    // Empty on idle so a repeat copy re-triggers the live region.
    expect(copyAnnouncement('idle', 'Скопировано', 'Ошибка')).toBe('')
  })
})
