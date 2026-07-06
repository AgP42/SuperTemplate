import {DeviceEventEmitter, NativeModules} from 'react-native';
import {log} from './utils/logger';

const {FloatingBubble} = NativeModules;

/** Whether the native bubble module was loaded by PluginHost. */
export function bubbleAvailable() {
  return !!FloatingBubble;
}

export async function bubbleHasPermission() {
  if (!FloatingBubble) {
    return false;
  }
  try {
    return await FloatingBubble.checkOverlayPermission();
  } catch (e) {
    log(`checkOverlayPermission failed: ${e.message}`);
    return false;
  }
}

export function bubbleRequestPermission() {
  if (FloatingBubble) {
    FloatingBubble.requestOverlayPermission();
  }
}

export function bubbleShow() {
  if (FloatingBubble) {
    FloatingBubble.show();
  }
}

export function bubbleHide() {
  if (FloatingBubble) {
    FloatingBubble.hide();
  }
}

export async function bubbleIsShowing() {
  if (!FloatingBubble) {
    return false;
  }
  try {
    return await FloatingBubble.isShowing();
  } catch (_) {
    return false;
  }
}

/**
 * Subscribe to bubble taps.
 * @param {() => void} onTap
 * @returns {{remove: () => void}}
 */
export function bubbleOnTap(onTap) {
  return DeviceEventEmitter.addListener('onBubbleTap', onTap);
}

/**
 * Subscribe to permission-denied events (show() without overlay permission).
 * @param {() => void} cb
 * @returns {{remove: () => void}}
 */
export function bubbleOnPermissionDenied(cb) {
  return DeviceEventEmitter.addListener('onBubblePermissionDenied', cb);
}
