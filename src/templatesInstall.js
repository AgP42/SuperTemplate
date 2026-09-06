import RNFS from 'react-native-fs';
import {log} from './utils/logger';
import {TEMPLATE_DATA} from './templateData';

/**
 * DEST: the device's MyStyle folder (shared storage), where Supernote picks up
 * page templates. Writing here is gated only by FILE:WRITE (requested before
 * this runs) — unlike the plugin's own private dir, which the Chauvet host may
 * refuse to read when the plugin runs under another plugin's sandbox identity.
 */
const DEST_DIR = `${RNFS.ExternalStorageDirectoryPath}/MyStyle`;

/**
 * Write the six bundled template PNGs into MyStyle so the user can pick them as
 * note templates. The PNG bytes are embedded in the JS bundle (base64,
 * templateData.js) and written straight to shared storage — nothing is read
 * from the plugin's private dir, which is what used to fail with "not allowed
 * to access other plugin's private dir" on a device running several plugins
 * (field report 2026-09-06, Nomad). Creates MyStyle if it's missing.
 * @returns {Promise<{installed:string[], failed:string[], errors:string[]}>}
 */
export async function installBundledTemplates() {
  const out = {installed: [], failed: [], errors: []};

  try {
    await RNFS.mkdir(DEST_DIR);
    log(`ensured MyStyle exists: ${DEST_DIR}`);
  } catch (e) {
    log(`mkdir ${DEST_DIR} failed: ${e.message}`);
    out.errors.push(`MyStyle folder: ${e.message}`);
  }

  for (const name of Object.keys(TEMPLATE_DATA)) {
    const dest = `${DEST_DIR}/${name}`;
    try {
      await RNFS.writeFile(dest, TEMPLATE_DATA[name], 'base64');
      log(`template "${name}": written to ${dest}`);
      out.installed.push(name);
    } catch (e) {
      log(`template "${name}": install failed — ${e.message}`);
      out.failed.push(name);
      out.errors.push(`${name}: ${e.message}`);
    }
  }

  return out;
}
