import type { LocaleObject } from '@nuxtjs/i18n'

// Locale list mirrors the languages Bitrix24 ships in the portal interface.
// Codes follow the reference app (`bx-shef/app-convert-bbocode-md`) so that
// when our placement is loaded in B24 the LANG_ALL keys match what B24 sends.
export const contentLocales: LocaleObject[] = [
  { code: 'en', name: 'English', file: 'en.json' },
  { code: 'ru', name: 'Русский', file: 'ru.json' },
  { code: 'de', name: 'Deutsch', file: 'de.json' },
  { code: 'la', name: 'Español', file: 'la.json' },
  { code: 'br', name: 'Português (Brasil)', file: 'br.json' },
  { code: 'fr', name: 'Français', file: 'fr.json' },
  { code: 'it', name: 'Italiano', file: 'it.json' },
  { code: 'pl', name: 'Polski', file: 'pl.json' },
  { code: 'ua', name: 'Українська', file: 'ua.json' },
  { code: 'tr', name: 'Türkçe', file: 'tr.json' },
  { code: 'sc', name: '中文（简体）', file: 'sc.json' },
  { code: 'tc', name: '中文（繁體）', file: 'tc.json' },
  { code: 'ja', name: '日本語', file: 'ja.json' },
  { code: 'vn', name: 'Tiếng Việt', file: 'vn.json' },
  { code: 'id', name: 'Bahasa Indonesia', file: 'id.json' },
  { code: 'ms', name: 'Bahasa Melayu', file: 'ms.json' },
  { code: 'th', name: 'ภาษาไทย', file: 'th.json' },
  { code: 'ar', name: 'عربي', file: 'ar.json' },
  { code: 'kz', name: 'Қазақша', file: 'kz.json' }
]
