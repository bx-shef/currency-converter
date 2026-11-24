FROM node:22.22.0-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json ./
# Copy lock file when available for reproducible installs
COPY pnpm-lock.yaml* ./
RUN pnpm install --ignore-scripts

FROM deps AS builder
WORKDIR /app
COPY . .
ARG NUXT_PUBLIC_YANDEX_COUNTER_ID
ENV NUXT_PUBLIC_YANDEX_COUNTER_ID=$NUXT_PUBLIC_YANDEX_COUNTER_ID
# Bitrix24 placement HANDLER is built from this at install time; must match
# the public domain the image is served from, otherwise placement.bind stores
# a broken (relative) URL.
ARG NUXT_PUBLIC_SITE_URL
ENV NUXT_PUBLIC_SITE_URL=$NUXT_PUBLIC_SITE_URL
ARG NUXT_PUBLIC_AUTHOR_NAME
ENV NUXT_PUBLIC_AUTHOR_NAME=$NUXT_PUBLIC_AUTHOR_NAME
ARG NUXT_PUBLIC_AUTHOR_URL
ENV NUXT_PUBLIC_AUTHOR_URL=$NUXT_PUBLIC_AUTHOR_URL
# Git commit of this build — the footer links to it. CI passes ${{ github.sha }}.
# Baked into the client bundle at `pnpm build`, so it must be set before it runs.
ARG NUXT_PUBLIC_COMMIT_SHA
ENV NUXT_PUBLIC_COMMIT_SHA=$NUXT_PUBLIC_COMMIT_SHA
# Optional override for the «app in Bitrix24» card URL. Empty (the usual case) →
# the app falls back to the published MARKETPLACE_URL constant in code, so the
# card still shows. Baked at build time like the other public config.
ARG NUXT_PUBLIC_MARKETPLACE_URL
ENV NUXT_PUBLIC_MARKETPLACE_URL=$NUXT_PUBLIC_MARKETPLACE_URL
# OG image (public/og.png) is committed to the repo and copied in with the source
# above — no build-time render (issue #81). Regenerate with `pnpm og:snapshot`.
# Node server (#200): pages are rendered per request by Nitro; security headers and the CSP (with hashes of
# Nuxt's inline scripts, taken from the server's own render) are set by the server — server/lib/security.ts.
RUN pnpm build

FROM node:22.22.0-alpine AS runner
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
WORKDIR /app
COPY --from=builder /app/.output ./.output
# Fail the build if the committed OG image or the server entry didn't make it into the output (issue #81).
RUN test -f .output/public/og.png || { echo 'og.png missing from build output'; exit 1; }
RUN test -f .output/server/index.mjs || { echo 'server entry missing from build output'; exit 1; }
# Non-root (uid 1000 of the node image). 8080 keeps the nginx-proxy VIRTUAL_PORT unchanged.
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1
CMD ["node", ".output/server/index.mjs"]
