import {NativeModules} from 'react-native';

const {FloatingBubble} = NativeModules;

/**
 * Floating bubble — DEFENSIVE HIDE ONLY.
 *
 * The native module stays in the codebase (adapted from Inkling, MIT) but
 * the bubble is never shown: every reinstall creates a new RN instance
 * whose predecessor's overlay becomes an unremovable orphan (only a device
 * reboot clears them), and it floats over ALL apps. bubbleHide() is called
 * at boot to clear this instance's own bubble if one exists.
 */
export function bubbleHide() {
  if (FloatingBubble) {
    FloatingBubble.hide();
  }
}
