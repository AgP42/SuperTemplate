import {PluginManager} from 'sn-plugin-lib';
import {log} from './logger';

/**
 * Plugin permission strings (sn-plugin-lib 0.1.65 / Chauvet preview firmware).
 * The host enforces these even on raw java.io / RNFS access to shared storage
 * (Note, Document, MyStyle, …): a read on a non-granted path throws a native
 * "no READ permission on sdcard" SecurityException. SuperTemplate both READS
 * (loadConfig via RNFS, getElements/getElement/getTitles/getKeyWords) and
 * WRITES (setLassoTitle, insertText, insertKeyWord, deleteElements,
 * modifyElements) shared storage, so it needs FILE:READ + FILE:WRITE. Both are
 * declared in PluginConfig.json `uses-permissions` — without the declaration
 * requestPermission fails with code 1500.
 */
export const PERM_FILE_READ = 'plugin.permission.FILE:READ';
export const PERM_FILE_WRITE = 'plugin.permission.FILE:WRITE';

let granted = false;

/**
 * Grant one permission (idempotent per call).
 *   hasPermission → 0 = not granted, 1 = granted
 *   requestPermission → 0 = deny, 1 = allow this time, 2 = always allow
 */
async function ensure(permission, desc) {
  const has = await PluginManager.hasPermission(permission);
  log(`hasPermission(${permission}) → ${has}`);
  if (has === 1) {
    return true;
  }
  const res = await PluginManager.requestPermission(permission, desc);
  log(`requestPermission(${permission}) → ${res}`);
  return res === 1 || res === 2;
}

/**
 * Ensure FILE:READ + FILE:WRITE before touching the note or the config files.
 * Call early in boot() (before loadConfig's RNFS read) and again as a guard in
 * the action pipeline. Caches success. On the OLD firmware the permission APIs
 * are absent (the native side throws); we then assume granted so a 0.1.65-built
 * plugin still runs pre-upgrade.
 * @returns {Promise<boolean>} whether reading AND writing are allowed.
 */
export async function ensureFilePermissions() {
  if (granted) {
    return true;
  }
  try {
    const read = await ensure(
      PERM_FILE_READ,
      'SuperTemplate reads this note and its settings to place the heading and datetime.',
    );
    const write = await ensure(
      PERM_FILE_WRITE,
      'SuperTemplate writes the heading, datetime and keyword onto this note.',
    );
    granted = read && write;
    return granted;
  } catch (e) {
    // Legacy host with no permission system: don't block the plugin.
    log(`ensureFilePermissions: no permission host (${e.message}) — assuming granted.`);
    granted = true;
    return true;
  }
}
