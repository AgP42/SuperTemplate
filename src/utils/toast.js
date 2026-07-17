import {Platform, ToastAndroid} from 'react-native';
import {log} from './logger';

/**
 * System popup (Android toast) — visible even with no plugin view open.
 * Shown at the TOP of the screen (everything the plugin does happens in
 * the page header, so a bottom toast goes unnoticed); Android versions
 * that ignore toast gravity fall back to the system position.
 * Falls back to a log line if the host refuses to display it.
 */
export function toast(msg) {
  try {
    if (Platform.OS === 'android' && ToastAndroid) {
      if (ToastAndroid.showWithGravityAndOffset && ToastAndroid.TOP != null) {
        ToastAndroid.showWithGravityAndOffset(
          msg,
          ToastAndroid.LONG,
          ToastAndroid.TOP,
          0,
          120,
        );
      } else if (ToastAndroid.show) {
        ToastAndroid.show(msg, ToastAndroid.LONG);
      }
    }
  } catch (e) {
    log(`toast failed: ${e.message}`);
  }
}
