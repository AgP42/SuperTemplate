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
    await rotateIfHuge();
  } catch (e) {
    console.warn(`[SuperTemplate] log flush failed: ${e.message}`);
  }
}

const MAX_LOG_BYTES = 512 * 1024;
const KEEP_TAIL_BYTES = 128 * 1024;

/** Keep the log file bounded: past 512 KB, keep only the last 128 KB. */
async function rotateIfHuge() {
  try {
    const st = await RNFS.stat(LOG_FILE);
    if (Number(st.size) <= MAX_LOG_BYTES) {
      return;
    }
    const content = await RNFS.readFile(LOG_FILE, 'utf8');
    const tail = content.slice(-KEEP_TAIL_BYTES);
    const cut = tail.indexOf('\n--- '); // start at a section boundary
    await RNFS.writeFile(
      LOG_FILE,
      `--- LOG ROTATED (kept the most recent sections) ---\n${cut >= 0 ? tail.slice(cut) : tail}`,
      'utf8',
    );
  } catch (_) {
    // rotation is best-effort — never block logging
  }
}
