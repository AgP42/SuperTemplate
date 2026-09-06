import {Image} from 'react-native';
import RNFS from 'react-native-fs';
import {log} from './utils/logger';

/**
 * Template pages bundled with the plugin. Each entry is copied into the
 * device's MyStyle folder so it becomes selectable as a note template.
 * Add new templates here AND as a `templates` entry in the config (zones).
 */
const BUNDLED_TEMPLATES = [
  {name: 'SuperTemplate_simpleNote.png', asset: require('../assets/templates/SuperTemplate_simpleNote.png')},
  {name: 'SuperTemplate_simpleNote_logoLight.png', asset: require('../assets/templates/SuperTemplate_simpleNote_logoLight.png')},
  {name: 'SuperTemplate_simpleNote_noLogo.png', asset: require('../assets/templates/SuperTemplate_simpleNote_noLogo.png')},
  {name: 'SuperTemplate_dotGrid.png', asset: require('../assets/templates/SuperTemplate_dotGrid.png')},
  {name: 'SuperTemplate_dotGrid_logoLight.png', asset: require('../assets/templates/SuperTemplate_dotGrid_logoLight.png')},
  {name: 'SuperTemplate_dotGrid_noLogo.png', asset: require('../assets/templates/SuperTemplate_dotGrid_noLogo.png')},
];

const DEST_DIR = `${RNFS.ExternalStorageDirectoryPath}/MyStyle`;

/**
 * Resolve the on-disk source path of a bundled template.
 * `Image.resolveAssetSource` returns a `file://…/plugins/<id>/drawable-<dpi>/…`
 * path, but the plugin only ships the assets in ONE density bucket
 * (drawable-mdpi). On a device whose density maps to a different bucket the
 * resolver points at a file that doesn't exist, so the copy fails with ENOENT.
 * Fall back to scanning the sibling `drawable-*` folders for the same file.
 * @returns {Promise<string|null>} an existing file path, or null.
 */
async function resolveTemplateSource(uri, name) {
  if (uri.startsWith('http')) {
    return null; // dev-server URI: handled separately (download)
  }
  let path = uri.startsWith('file://') ? uri.replace('file://', '') : uri;
  if (!path.startsWith('/')) {
    log(`template "${name}": unsupported uri scheme (${uri})`);
    return null;
  }
  if (await RNFS.exists(path)) {
    return path;
  }
  log(`template "${name}": resolved path missing (${path}) — scanning drawable-* buckets`);
  const m = path.match(/^(.*)\/drawable-[^/]+\/([^/]+)$/);
  if (m) {
    const base = m[1];
    const file = m[2];
    try {
      const entries = await RNFS.readDir(base);
      for (const e of entries) {
        if (
          (typeof e.isDirectory === 'function' ? e.isDirectory() : false) &&
          e.name.indexOf('drawable') === 0
        ) {
          const cand = `${base}/${e.name}/${file}`;
          if (await RNFS.exists(cand)) {
            log(`template "${name}": found under ${e.name}`);
            return cand;
          }
        }
      }
    } catch (e) {
      log(`template "${name}": drawable scan failed — ${e.message}`);
    }
  }
  return null;
}

/**
 * Copy the bundled template PNGs to MyStyle so the user can pick them as
 * note templates. Creates MyStyle if missing (a fresh device may not have it
 * yet), resolves each RN asset (with a density-bucket fallback), then copies.
 * @returns {Promise<{installed:string[], failed:string[], errors:string[]}>}
 */
export async function installBundledTemplates() {
  const out = {installed: [], failed: [], errors: []};

  // A fresh device may not have MyStyle yet — copyFile into a missing folder
  // fails. mkdir is a no-op when it already exists. Needs FILE:WRITE (the
  // caller requests it first).
  try {
    await RNFS.mkdir(DEST_DIR);
    log(`ensured MyStyle exists: ${DEST_DIR}`);
  } catch (e) {
    log(`mkdir ${DEST_DIR} failed: ${e.message}`);
    out.errors.push(`MyStyle folder: ${e.message}`);
  }

  for (const tpl of BUNDLED_TEMPLATES) {
    try {
      const resolved = Image.resolveAssetSource(tpl.asset);
      const uri = resolved ? resolved.uri : null;
      log(`template "${tpl.name}": asset uri = ${uri}`);
      if (!uri) {
        out.failed.push(tpl.name);
        out.errors.push(`${tpl.name}: asset did not resolve`);
        continue;
      }

      const dest = `${DEST_DIR}/${tpl.name}`;
      if (uri.startsWith('http')) {
        // Dev-server URI (metro) — download instead of copy.
        await RNFS.downloadFile({fromUrl: uri, toFile: dest}).promise;
      } else {
        const src = await resolveTemplateSource(uri, tpl.name);
        if (!src) {
          out.failed.push(tpl.name);
          out.errors.push(`${tpl.name}: source file not found`);
          continue;
        }
        await RNFS.copyFile(src, dest);
      }
      log(`template "${tpl.name}": copied to ${dest}`);
      out.installed.push(tpl.name);
    } catch (e) {
      log(`template "${tpl.name}": install failed — ${e.message}`);
      out.failed.push(tpl.name);
      out.errors.push(`${tpl.name}: ${e.message}`);
    }
  }

  return out;
}
