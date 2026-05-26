FROM node:20-alpine AS base
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
# Generate OG image from SVG (DejaVu supports Cyrillic).
# inkscape 1.x replaces rsvg-convert which was removed in librsvg 2.57+
RUN apk add --no-cache inkscape font-dejavu fontconfig && fc-cache -f && \
    inkscape -o public/og.png scripts/og.svg
RUN pnpm generate

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/.output/public /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
