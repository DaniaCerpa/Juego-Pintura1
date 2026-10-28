import es from '../data/i18n/es.json';
import en from '../data/i18n/en.json';

export type Lang = 'es' | 'en';
const tables: Record<Lang, Record<string, string>> = { es, en };
let current: Lang = 'es';

export function setLang(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

/** Idioma del dispositivo en el primer arranque: es* → español; cualquier otro → inglés. */
export function detectLang(navLang: string | undefined): Lang {
  return navLang && navLang.toLowerCase().startsWith('es') ? 'es' : 'en';
}

/** Traduce una clave con parámetros `{nombre}`. Si falta, devuelve la clave. */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const raw = tables[current][key] ?? tables.es[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}
