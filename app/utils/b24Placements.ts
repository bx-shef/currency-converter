/**
 * Pure helpers for the install flow's `placement.bind` (issue #31, #89).
 * No SDK import — unit-testable in isolation. The actual REST calls live in
 * `app/pages/install.vue`.
 */

/** One placement this app registers, with its B24 `OPTIONS`. */
export interface PlacementSpec {
  readonly code: string
  readonly options: Readonly<Record<string, unknown>>
}

/** An existing binding as returned by `placement.get`. */
export interface ExistingPlacement {
  placement: string
  handler: string
}

/** A single REST call for the install batch. */
export interface PlacementCall {
  method: 'placement.unbind' | 'placement.bind'
  params: Record<string, unknown>
}

/** Unbind and bind calls, kept separate so callers can run them as two batches:
 *  best-effort cleanup first, then binds whose failures must be surfaced. */
export interface PlacementCalls {
  unbind: PlacementCall[]
  bind: PlacementCall[]
}

/**
 * For each placement: schedule an unbind of every existing binding of ours for
 * that placement (any handler — old bindings may point at a previous deploy
 * domain), then one bind. Result: exactly one clean registration per placement.
 *
 * Unbind and bind are returned separately so the caller can run cleanup as a
 * best-effort batch (a missing stale binding is fine) and the binds as a batch
 * whose errors are checked — a failed bind (e.g. missing `mobile` scope) must
 * not be swallowed.
 */
export function buildPlacementCalls(
  existing: ReadonlyArray<ExistingPlacement>,
  placements: ReadonlyArray<PlacementSpec>,
  handlerUrl: string,
  title: string,
  langAll: Record<string, { TITLE: string }>
): PlacementCalls {
  const unbind: PlacementCall[] = []
  const bind: PlacementCall[] = []
  for (const p of placements) {
    for (const s of existing.filter(item => item.placement === p.code)) {
      unbind.push({ method: 'placement.unbind', params: { PLACEMENT: p.code, HANDLER: s.handler } })
    }
    bind.push({
      method: 'placement.bind',
      params: {
        PLACEMENT: p.code,
        HANDLER: handlerUrl,
        TITLE: title,
        LANG_ALL: langAll,
        OPTIONS: p.options
      }
    })
  }
  return { unbind, bind }
}
