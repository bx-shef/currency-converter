// Standalone-site content: ecosystem links (header nav / footer) and the promo
// blocks shown under the calculator. Single source of truth so the copy and URLs
// live in one tested place instead of being scattered across templates. This page
// also embeds into Bitrix24 (dual-mode); the promo blocks are hidden inside the
// portal iframe — see `ConverterPromo` / index.vue.

/** A labelled outbound link (footer lists, header nav). */
export interface SiteLink {
  id: string
  label: string
  href: string
}

/** Partner site — where custom development is offered / the brief lives. */
export const MAIN_SITE_URL = 'https://offer.bx-shef.by/'

/** Sibling product landing: the client-bank statement import app. */
export const CLIENT_BANK_LANDING_URL = 'https://bank-import.bx-shef.by/'

/** Custom-development CTA target: the partner site's request brief. */
export const CUSTOM_DEV_URL = 'https://offer.bx-shef.by/#brief'

/**
 * Bitrix24 Marketplace listing of this app (public, stable). Used as the default
 * for the «app in Bitrix24» card; `NUXT_PUBLIC_MARKETPLACE_URL` can override it
 * without a code change (e.g. a regional listing). Hardcoding the known URL —
 * like the sibling repos do — means the card shows even if the CI Variable is
 * unset (an empty env would otherwise blank the runtimeConfig default).
 */
export const MARKETPLACE_URL = 'https://www.bitrix24.ru/apps/app/shef.currencyconverter/'

/**
 * Resolve the marketplace URL for the card: a non-blank env override
 * (`NUXT_PUBLIC_MARKETPLACE_URL`), else the published constant. Trims first, so a
 * whitespace-only env value falls back to the constant (rather than becoming a
 * blank URL that `isMarketplaceListing` would then hide), and a padded override
 * is cleaned before it reaches the CTA/QR.
 */
export function resolveMarketplaceUrl(envValue: unknown): string {
  return String(envValue ?? '').trim() || MARKETPLACE_URL
}

/** Data source / partner links shown in the footer (first row). */
export const FOOTER_LINKS: readonly SiteLink[] = [
  { id: 'nbrb', label: 'api.nbrb.by', href: 'https://api.nbrb.by' },
  { id: 'offer', label: 'offer.bx-shef.by', href: MAIN_SITE_URL }
]

/**
 * Other free tools in the bx-shef ecosystem (footer, second row). The converter
 * itself is intentionally absent — this IS the converter, so no self-link.
 */
export const ECOSYSTEM_TOOLS: readonly SiteLink[] = [
  { id: 'bankimport', label: 'Импорт выписки клиент-банка', href: CLIENT_BANK_LANDING_URL },
  { id: 'bbcode', label: 'BBCode ↔ Markdown', href: 'https://bx-shef.github.io/app-convert-bbocode-md/' }
]

/** Copy for the «app in Bitrix24» promo card. */
export const PROMO_MARKETPLACE = {
  eyebrow: 'Приложение для Bitrix24',
  title: 'Конвертер прямо в чате Bitrix24',
  text: 'Виджет в панели над полем ввода сообщения: курс НБ РБ, сумма прописью и вставка в сообщение — не выходя из чата.',
  cta: 'Открыть в Маркете Bitrix24'
} as const

/** Copy for the custom-development banner. */
export const PROMO_CUSTOM_DEV = {
  eyebrow: 'ИП Шевчик · Партнёр Bitrix24',
  title: 'Нужна доработка под ваш процесс?',
  text: 'Дорабатываем приложения и автоматизируем Bitrix24 под вашу задачу — от небольших правок до интеграций с банками и 1С.',
  cta: 'Обсудить доработку'
} as const

/**
 * Whether a real Marketplace listing URL is present. Drives whether the «app in
 * Bitrix24» card renders — a fail-safe: if both the constant and the env are
 * ever emptied, the card hides rather than showing a dead link. In practice the
 * constant is set, so the card shows.
 */
export function isMarketplaceListing(configured: string | undefined | null): boolean {
  return Boolean((configured ?? '').trim())
}
