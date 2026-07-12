import {Platform, ToastAndroid} from 'react-native';
import {log} from './logger';

/**
 * System popup (Android toast) — visible even with no plugin view open.
 * Falls back to a log line if the host refuses to display it.
 */
export function toast(msg) {
  try {
    if (Platform.OS === 'android' && ToastAndroid && ToastAndroid.show) {
      ToastAndroid.show(msg, ToastAndroid.LONG);
    }
  } catch (e) {
    log(`toast failed: ${e.message}`);
  }
}
