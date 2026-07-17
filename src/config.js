import RNFS from 'react-native-fs';
import {ZONES} from './zones';

const CONFIG_DIR = `${RNFS.ExternalStorageDirectoryPath}/MyStyle/Plugins/SuperTemplate`;
const CONFIG_FILE = `${CONFIG_DIR}/SuperTemplate_Config.json`;
// Pre-0.5 location — read once and migrated on first load.
const LEGACY_CONFIG_FILE = `${RNFS.ExternalStorageDirectoryPath}/MyStyle/Plugins/SuperTemplate_Config.json`;

export const DATE_FORMATS = [
  {key: 'fr', label: '05/07/2026 14:32'},
  {key: 'iso', label: '2026-07-05 14:32'},
  {key: 'long', label: 'dimanche 5 juillet 2026'},
  {key: 'day', label: 'dim. 05/07/2026 14:32'},
];

export const FONT_SIZES = [
  {key: 'S', value: 28},
  {key: 'M', value: 40},
  {key: 'L', value: 52},
  {key: 'XL', value: 64},
];

/** Font sizes offered for the OCR heading text (Supernote text scale). */
export const HEADING_FONT_SIZES = [
  {key: 'S', value: 60},
  {key: 'M', value: 90},
  {key: 'L', value: 132},
  {key: 'XL', value: 180},
];

/** Font choices for the OCR heading text (system font file paths). */
export const HEADING_FONTS = [
  {key: 'default', label: 'Default', path: null},
  {key: 'serif', label: 'Serif', path: '/system/fonts/NotoSerif-Regular.ttf'},
  {key: 'mono', label: 'Mono', path: '/system/fonts/DroidSansMono.ttf'},
];

/** User font folder — .ttf/.otf dropped here appear as OCR font choices. */
export const USER_FONTS_DIR = `${RNFS.ExternalStorageDirectoryPath}/MyStyle/fonts`;

/**
 * Resolve the configured heading font to a file path: built-in key, or a
 * .ttf/.otf filename from MyStyle/fonts (user font). Null = system default.
 */
export function resolveHeadingFontPath(key) {
  const builtin = HEADING_FONTS.find(f => f.key === (key || 'default'));
  if (builtin) {
    return builtin.path;
  }
  if (key && /\.(ttf|otf)$/i.test(key)) {
    return `${USER_FONTS_DIR}/${key}`;
  }
  return null;
}

/** List the user's .ttf/.otf files in MyStyle/fonts (empty if none). */
export async function listUserFonts() {
  try {
    const items = await RNFS.readDir(USER_FONTS_DIR);
    return items
      .filter(i => i.isFile() && /\.(ttf|otf)$/i.test(i.name))
      .map(i => i.name)
      .sort();
  } catch (_) {
    return [];
  }
}

/** setLassoTitle style codes — the 4 native Supernote heading renderings. */
export const HEADING_STYLES = [
  {key: 1, label: 'Black'},
  {key: 2, label: 'Gray / white'},
  {key: 3, label: 'Gray / black'},
  {key: 4, label: 'Shadow'},
];

/**
 * Zone coordinates are ratios of the page size (0..1), so they are valid on
 * any device resolution. Users can adjust them for their own template by
 * editing MyStyle/Plugins/SuperTemplate_Config.json directly — add entries
 * to `templates` and select one via `activeTemplate` (or the config screen).
 */
export const DEFAULT_CONFIG = {
  dateFormat: 'fr',
  language: 'fr',
  fontSize: 40,
  keyword: true,
  keywordFormat: 'YYYYMMDD',
  headingStyle: 1,
  styleUnderline: 2,
  styleDoubleUnderline: 4,
  headingOcr: false,
  headingFontSize: 90,
  headingFont: 'default',
  logging: false,
  activeTemplate: 'SuperTemplate_simpleNote',
  // The three variants share the same layout, hence the same zones — they
  // differ only in the printed logo (black / light gray / none).
  templates: [
    {name: 'SuperTemplate_simpleNote', zones: ZONES},
    {name: 'SuperTemplate_simpleNote_logoLight', zones: ZONES},
    {name: 'SuperTemplate_simpleNote_noLogo', zones: ZONES},
  ],
};

let cached = null;

/**
 * Synchronous access to the last loaded/saved config (defaults before the
 * first load). Used by hot paths like the tap hit-test.
 * @returns {typeof DEFAULT_CONFIG}
 */
export function getCachedConfig() {
  return cached || DEFAULT_CONFIG;
}

/**
 * Load the persisted config, falling back to defaults field by field.
 * Cached in memory after the first read.
 * @returns {Promise<typeof DEFAULT_CONFIG>}
 */
export async function loadConfig() {
  if (cached) {
    return cached;
  }
  try {
    let file = CONFIG_FILE;
    if (!(await RNFS.exists(file)) && (await RNFS.exists(LEGACY_CONFIG_FILE))) {
      file = LEGACY_CONFIG_FILE;
    }
    if (await RNFS.exists(file)) {
      const raw = await RNFS.readFile(file, 'utf8');
      cached = {...DEFAULT_CONFIG, ...JSON.parse(raw)};
      // A saved config's `templates` replaces the defaults wholesale —
      // graft in any built-in template the file predates.
      const known = new Set((cached.templates || []).map(t => t.name));
      for (const t of DEFAULT_CONFIG.templates) {
        if (!known.has(t.name)) {
          cached.templates = [...(cached.templates || []), t];
        }
      }
      if (file === LEGACY_CONFIG_FILE) {
        await saveConfig(cached); // migrate to the new folder
      }
      return cached;
    }
  } catch (e) {
    console.warn(`[SuperTemplate] loadConfig failed: ${e.message}`);
  }
  cached = {...DEFAULT_CONFIG};
  return cached;
}

/**
 * Persist the config and refresh the in-memory cache.
 * @param {typeof DEFAULT_CONFIG} config
 * @returns {Promise<boolean>}
 */
export async function saveConfig(config) {
  cached = {...DEFAULT_CONFIG, ...config};
  try {
    const dir = CONFIG_FILE.substring(0, CONFIG_FILE.lastIndexOf('/'));
    await RNFS.mkdir(dir);
    await RNFS.writeFile(CONFIG_FILE, JSON.stringify(cached, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.warn(`[SuperTemplate] saveConfig failed: ${e.message}`);
    return false;
  }
}

/**
 * Resolve the zones of the active template (falls back to the built-in template).
 * @param {typeof DEFAULT_CONFIG} config
 * @returns {{datetime:object, title:object}}
 */
export function getActiveZones(config) {
  const tpl =
    (config.templates || []).find(t => t.name === config.activeTemplate) ||
    (config.templates || [])[0];
  return (tpl && tpl.zones) || ZONES;
}
