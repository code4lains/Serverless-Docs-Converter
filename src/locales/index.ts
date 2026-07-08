import { createI18n } from 'vue-i18n'
import en from './en'
import zh from './zh'

const LOCALE_KEY = 'docs-converter-locale'

function getDefaultLocale(): string {
  try {
    const saved = localStorage.getItem(LOCALE_KEY)
    if (saved && (saved === 'en' || saved === 'zh')) return saved
  } catch {}
  const nav = navigator.language || ''
  return nav.startsWith('zh') ? 'zh' : 'en'
}

const i18n = createI18n({
  legacy: false,
  locale: getDefaultLocale(),
  fallbackLocale: 'en',
  messages: { en, zh },
})

export function setLocale(locale: 'en' | 'zh') {
  i18n.global.locale.value = locale
  try {
    localStorage.setItem(LOCALE_KEY, locale)
  } catch {}
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
}

export default i18n
