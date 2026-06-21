import { describe, expect, it } from 'vitest'
import { buildPlacementCalls, type PlacementSpec, type ExistingPlacement } from '../app/utils/b24Placements'

const PLACEMENTS: PlacementSpec[] = [
  { code: 'IM_TEXTAREA', options: { iconName: 'Currency', context: 'ALL', width: '360', height: '320' } },
  { code: 'IMMOBILE_CONTEXT_MENU', options: { context: 'ALL', role: 'USER', extranet: 'N' } }
]
const HANDLER = 'https://example.com/widget/converter'
const TITLE = 'Currency Converter'
const LANG = { en: { TITLE: 'Currency Converter' }, ru: { TITLE: 'Конвертер валют' } }

describe('buildPlacementCalls', () => {
  it('fresh install (no existing): zero unbinds, one bind per placement', () => {
    const { unbind, bind } = buildPlacementCalls([], PLACEMENTS, HANDLER, TITLE, LANG)
    expect(unbind).toEqual([])
    expect(bind.map(c => c.params.PLACEMENT)).toEqual(['IM_TEXTAREA', 'IMMOBILE_CONTEXT_MENU'])
    expect(bind.every(c => c.method === 'placement.bind')).toBe(true)
  })

  it('passes HANDLER, TITLE, LANG_ALL and the per-placement OPTIONS through to each bind', () => {
    const { bind } = buildPlacementCalls([], PLACEMENTS, HANDLER, TITLE, LANG)
    expect(bind[0].params).toEqual({
      PLACEMENT: 'IM_TEXTAREA',
      HANDLER: HANDLER,
      TITLE,
      LANG_ALL: LANG,
      OPTIONS: { iconName: 'Currency', context: 'ALL', width: '360', height: '320' }
    })
    // Mobile spec carries no width/height/iconName (slider sizes itself).
    expect(bind[1].params.OPTIONS).toEqual({ context: 'ALL', role: 'USER', extranet: 'N' })
  })

  it('unbinds only the placement that has stale bindings, isolated by code', () => {
    const existing: ExistingPlacement[] = [
      { placement: 'IM_TEXTAREA', handler: 'https://old.example/widget/converter' }
    ]
    const { unbind } = buildPlacementCalls(existing, PLACEMENTS, HANDLER, TITLE, LANG)
    expect(unbind).toEqual([
      { method: 'placement.unbind', params: { PLACEMENT: 'IM_TEXTAREA', HANDLER: 'https://old.example/widget/converter' } }
    ])
  })

  it('unbinds every stale handler for a placement before binding', () => {
    const existing: ExistingPlacement[] = [
      { placement: 'IM_TEXTAREA', handler: 'https://a.example/h' },
      { placement: 'IM_TEXTAREA', handler: 'https://b.example/h' },
      { placement: 'IMMOBILE_CONTEXT_MENU', handler: 'https://c.example/h' }
    ]
    const { unbind } = buildPlacementCalls(existing, PLACEMENTS, HANDLER, TITLE, LANG)
    expect(unbind.map(c => c.params.HANDLER)).toEqual([
      'https://a.example/h',
      'https://b.example/h',
      'https://c.example/h'
    ])
  })

  it('ignores foreign placement codes when filtering stale bindings', () => {
    const existing: ExistingPlacement[] = [
      { placement: 'CRM_DEAL_DETAIL_TAB', handler: 'https://other.example/h' }
    ]
    const { unbind } = buildPlacementCalls(existing, PLACEMENTS, HANDLER, TITLE, LANG)
    expect(unbind).toEqual([])
  })
})
