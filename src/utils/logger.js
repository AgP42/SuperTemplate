import RNFS from 'react-native-fs';
import {getCachedConfig} from '../config';

const LOG_DIR = `${RNFS.ExternalStorageDirectoryPath}/MyStyle/Plugins/SuperTemplate`;
const LOG_FILE = `${LOG_DIR}/SuperTemplate_Log.txt`;

let buffer = '';
let t0 = null;

/** Mark the reference instant for the +ms prefixes of subsequent log lines. */
export function markT0() {
  t0 = Date.now();
}

/**
 * Append a line to the in-memory log buffer (also mirrored to console for
 * devices where logcat is available).
 * @param {string} msg
 */
export function log(msg) {
  const prefix = t0 != null ? `+${Date.now() - t0}ms ` : '';
  buffer += `${prefix}${msg}\n`;
  console.log(`[SuperTemplate] ${prefix}${msg}`);
}

/**
 * Flush the buffered lines to the on-device log file. This file is the only
 * debugging channel on gen-1 devices (A5 X) where adb logcat is blocked.
 * @param {string} header Section header written before the buffered lines.
 */
export async function flushLog(header) {
  if (getCachedConfig().logging === false) {
    buffer = '';
    return;
  }
  const section = `\n--- ${header} @ ${new Date().toISOString()} ---\n${buffer}`;
  buffer = '';
  try {
    await RNFS.mkdir(LOG_DIR);
    await RNFS.appendFile(LOG_FILE, section, 'utf8');
  } catch (e) {
    console.warn(`[SuperTemplate] log flush failed: ${e.message}`);
  }
}
