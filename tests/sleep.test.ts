import { describe, expect, it, vi } from 'vitest'
import { sleep } from '../app/utils/sleep'

describe('sleep', () => {
  it('resolves only after the given delay', async () => {
    vi.useFakeTimers()
    try {
      const settled = vi.fn()
      const promise = sleep(500).then(settled)

      await vi.advanceTimersByTimeAsync(499)
      expect(settled, 'must not resolve early').not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      await promise
      expect(settled).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('resolves on the next tick for a zero delay', async () => {
    await expect(sleep(0)).resolves.toBeUndefined()
  })
})
