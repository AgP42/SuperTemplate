/**
 * Pure datetime formatting helpers (no native imports — unit-testable).
 * Day/month names are bundled per language (Hermes has no reliable Intl).
 */

const LOCALES = {
  fr: {
    days: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
    daysShort: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
    months: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  },
  en: {
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  },
  de: {
    days: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
    daysShort: ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'],
    months: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  },
  es: {
    days: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    daysShort: ['dom.', 'lun.', 'mar.', 'mié.', 'jue.', 'vie.', 'sáb.'],
    months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  },
  it: {
    days: ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'],
    daysShort: ['dom.', 'lun.', 'mar.', 'mer.', 'gio.', 'ven.', 'sab.'],
    months: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
  },
};

export const SUPPORTED_LANGS = Object.keys(LOCALES);

const pad = n => String(n).padStart(2, '0');

/** Conventional numeric date per country (component order + separator). */
function numericDate(d, lang) {
  const y = d.getFullYear();
  switch (lang) {
    case 'en': // US convention
      return `${d.getMonth() + 1}/${d.getDate()}/${y}`;
    case 'de':
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${y}`;
    default: // fr, es, it
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${y}`;
  }
}

/** Conventional time per country (12h AM/PM for en, 24h elsewhere). */
function timeStr(d, lang) {
  if (lang === 'en') {
    const h24 = d.getHours();
    const h = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h}:${pad(d.getMinutes())} ${h24 < 12 ? 'AM' : 'PM'}`;
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Conventional full date per country. */
function longDate(d, lang) {
  const loc = LOCALES[lang] || LOCALES.fr;
  const day = loc.days[d.getDay()];
  const month = loc.months[d.getMonth()];
  const y = d.getFullYear();
  switch (lang) {
    case 'en':
      return `${day}, ${month} ${d.getDate()}, ${y}`;
    case 'de':
      return `${day}, ${d.getDate()}. ${month} ${y}`;
    case 'es':
      return `${day}, ${d.getDate()} de ${month} de ${y}`;
    case 'it':
      return `${day} ${d.getDate()} ${month} ${y}`;
    default: // fr
      return `${day} ${d.getDate()} ${month} ${y}`;
  }
}

/**
 * Format a Date according to the configured format key and language.
 * Each language uses its own national conventions (component order,
 * separators, 12/24-hour clock) — not just translated names.
 * @param {Date} d
 * @param {'fr'|'iso'|'long'|'day'} format Format key (see config.DATE_FORMATS).
 * @param {string} lang Two-letter language code (see SUPPORTED_LANGS).
 * @returns {string}
 */
export function formatStamp(d, format = 'fr', lang = 'fr') {
  const loc = LOCALES[lang] || LOCALES.fr;
  switch (format) {
    case 'iso':
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
        d.getDate(),
      )} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    case 'long':
      return longDate(d, lang);
    case 'day': {
      const sep = lang === 'de' || lang === 'es' || lang === 'en' ? ', ' : ' ';
      return `${loc.daysShort[d.getDay()]}${sep}${numericDate(d, lang)} ${timeStr(d, lang)}`;
    }
    case 'fr':
    default:
      return `${numericDate(d, lang)} ${timeStr(d, lang)}`;
  }
}

/** Available search-keyword formats (config.keywordFormat). */
export const KEYWORD_FORMATS = ['YYYYMMDD', 'YYYY-MM-DD', 'DD/MM/YYYY', 'YYYY-MM'];

/**
 * Format the date-linked search keyword.
 * @param {Date} d
 * @param {string} format One of KEYWORD_FORMATS.
 * @returns {string}
 */
export function formatKeyword(d, format = 'YYYYMMDD') {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  switch (format) {
    case 'YYYY-MM-DD':
      return `${y}-${m}-${day}`;
    case 'DD/MM/YYYY':
      return `${day}/${m}/${y}`;
    case 'YYYY-MM':
      return `${y}-${m}`;
    case 'YYYYMMDD':
    default:
      return `${y}${m}${day}`;
  }
}

const MONTH_NAMES = SUPPORTED_LANGS.flatMap(l => LOCALES[l].months);

/**
 * Heuristic: does this text look like one of our datetime stamps?
 * Used as an idempotence guard so re-triggering never stacks stamps.
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeStamp(text) {
  if (!text) {
    return false;
  }
  if (
    /\d{1,2}[./]\d{1,2}[./]\d{4}/.test(text) ||
    /\d{4}-\d{2}-\d{2}/.test(text)
  ) {
    return true;
  }
  const lower = text.toLowerCase();
  return /\d{4}/.test(text) && MONTH_NAMES.some(mn => lower.includes(mn.toLowerCase()));
}
