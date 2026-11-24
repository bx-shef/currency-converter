import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import type { McpKeyState, McpLogin } from '~/composables/useMcpAdmin'

// «Ключ для shef.cowork» card (docs/MCP.md): rendered only for the portal admin and only when the server has
// shef.cowork settings; the key appears once, after «Создать ключ».
const m = vi.hoisted(() => ({
  login: vi.fn<() => Promise<McpLogin>>(),
  key: vi.fn<(a: 'status' | 'issue' | 'revoke') => Promise<McpKeyState>>()
}))
vi.mock('~/composables/useMcpAdmin', () => ({ useMcpAdmin: () => ({ login: m.login, key: m.key }) }))

const McpKeyCard = await import('~/components/McpKeyCard.vue').then(x => x.default)
const URL_ = 'https://cc.example.by'

describe('McpKeyCard', () => {
  beforeEach(() => {
    m.login.mockReset()
    m.key.mockReset()
  })

  it('not an admin → nothing rendered, no key request', async () => {
    m.login.mockResolvedValue({ state: 'ready', admin: false })
    const w = await mountSuspended(McpKeyCard)
    await flushPromises()
    expect(w.find('[data-testid="mcp-key-card"]').exists()).toBe(false)
    expect(m.key).not.toHaveBeenCalled()
  })

  it('server without shef.cowork settings → nothing rendered', async () => {
    m.login.mockResolvedValue({ state: 'off' })
    const w = await mountSuspended(McpKeyCard)
    await flushPromises()
    expect(w.find('[data-testid="mcp-key-card"]').exists()).toBe(false)
  })

  it('admin: address, «Создать ключ», then the key shown once', async () => {
    m.login.mockResolvedValue({ state: 'ready', admin: true })
    m.key.mockImplementation(async a => (a === 'issue' ? { exists: true, url: URL_, key: 'k'.repeat(43) } : { exists: false, url: URL_ }))
    const w = await mountSuspended(McpKeyCard)
    await flushPromises()
    expect(w.get('[data-testid="mcp-url"]').text()).toBe(URL_)
    expect(w.text()).toContain('Ключа нет.')
    expect(w.find('[data-testid="mcp-key"]').exists()).toBe(false)
    await w.findAll('button').find(b => b.text() === 'Создать ключ')!.trigger('click')
    await flushPromises()
    expect(m.key).toHaveBeenLastCalledWith('issue')
    expect(w.get('[data-testid="mcp-key"]').text()).toBe('k'.repeat(43))
    expect(w.text()).toContain('один раз')
  })

  it('revoke asks first; «Отмена» keeps the key', async () => {
    m.login.mockResolvedValue({ state: 'ready', admin: true })
    m.key.mockResolvedValue({ exists: true, url: URL_ })
    const w = await mountSuspended(McpKeyCard)
    await flushPromises()
    await w.findAll('button').find(b => b.text() === 'Отозвать')!.trigger('click')
    expect(w.text()).toContain('Отозвать ключ?')
    await w.findAll('button').find(b => b.text() === 'Отмена')!.trigger('click')
    expect(m.key).not.toHaveBeenCalledWith('revoke')
    await w.findAll('button').find(b => b.text() === 'Отозвать')!.trigger('click')
    await w.findAll('button').find(b => b.text() === 'Да, отозвать')!.trigger('click')
    await flushPromises()
    expect(m.key).toHaveBeenLastCalledWith('revoke')
  })

  it('a server error is shown with role="alert"', async () => {
    m.login.mockResolvedValue({ state: 'error', message: 'Битрикс24 не подтвердил вход' })
    const w = await mountSuspended(McpKeyCard)
    await flushPromises()
    expect(w.get('[role="alert"]').text()).toContain('Битрикс24 не подтвердил вход')
  })
})
