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
];

const DEST_DIR = `${RNFS.ExternalStorageDirectoryPath}/MyStyle`;

/**
 * Copy the bundled template PNGs to MyStyle so the user can pick them as
 * note templates. Resolves each RN asset to its on-disk path inside the
 * installed plugin package, then copies with RNFS.
 * @returns {Promise<{installed:string[], failed:string[]}>}
 */
export async function installBundledTemplates() {
  const out = {installed: [], failed: []};

  for (const tpl of BUNDLED_TEMPLATES) {
    try {
      const resolved = Image.resolveAssetSource(tpl.asset);
      const uri = resolved ? resolved.uri : null;
      log(`template "${tpl.name}": asset uri = ${uri}`);
      if (!uri) {
        out.failed.push(tpl.name);
        continue;
      }

      const dest = `${DEST_DIR}/${tpl.name}`;
      if (uri.startsWith('file://')) {
        await RNFS.copyFile(uri.replace('file://', ''), dest);
      } else if (uri.startsWith('/')) {
        await RNFS.copyFile(uri, dest);
      } else if (uri.startsWith('http')) {
        // Dev-server URI (metro) — download instead of copy.
        await RNFS.downloadFile({fromUrl: uri, toFile: dest}).promise;
      } else {
        log(`template "${tpl.name}": unsupported uri scheme — skipped`);
        out.failed.push(tpl.name);
        continue;
      }
      log(`template "${tpl.name}": copied to ${dest}`);
      out.installed.push(tpl.name);
    } catch (e) {
      log(`template "${tpl.name}": install failed — ${e.message}`);
      out.failed.push(tpl.name);
    }
  }

  return out;
}
