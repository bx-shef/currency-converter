// Liveness for the container healthcheck and `make prod-smoke`: no store, no portal, no НБ РБ.
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { ok: true }
})
