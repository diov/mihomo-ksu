// All UI text goes through t(); adding a language is adding i18n/<lang>.js here.
import zh from './i18n/zh.js';

const MESSAGES = { zh };
const FALLBACK = 'zh';

const lang = (navigator.language || '').toLowerCase().split('-')[0];
export const locale = lang in MESSAGES ? lang : FALLBACK;

// t('header.versions', { module: 'v0.1.0' }) fills {module} placeholders.
export function t(key, params = {}) {
  const text = MESSAGES[locale][key] ?? MESSAGES[FALLBACK][key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

// Static markup marks its text with data-i18n="<key>" and icon-only labels with data-i18n-label.
export function translatePage() {
  document.documentElement.lang = locale;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', t(el.dataset.i18nLabel));
}
