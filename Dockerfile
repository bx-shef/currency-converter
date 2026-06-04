FROM node:22-alpine AS base
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
# Stamp the build commit so the post-deploy smoke job can tell when the new
# image is actually live behind Watchtower (served as /version.json).
ARG GIT_SHA=dev
RUN echo "{\"sha\":\"$GIT_SHA\"}" > public/version.json
# Generate OG image from SVG (DejaVu supports Cyrillic).
# inkscape 1.x replaces rsvg-convert which was removed in librsvg 2.57+
RUN apk add --no-cache inkscape font-dejavu fontconfig && fc-cache -f && \
    inkscape -o public/og.png scripts/og.svg
RUN pnpm generate

FROM nginx:1.31-alpine AS runner
COPY --from=builder /app/.output/public /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
