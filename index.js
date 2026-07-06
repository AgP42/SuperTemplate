/**
 * SuperTemplate — header actions triggered by double-tapping (finger) the
 * S logo printed left of the title bar on the template page.
 * The toolbar button opens the config screen.
 * @format
 */

import {AppRegistry, Dimensions, Image, NativeModules, PixelRatio} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import App from './App';
import {name as appName} from './app.json';
import {runHeaderActions} from './src/runHeaderActions';
import {loadConfig} from './src/config';
import {TRIGGER_SCREEN_ZONE} from './src/zones';
import {createDoubleTapDetector} from './src/utils/doubleTap';
import {bubbleHide} from './src/bubble';
import {log, flushLog, markT0} from './src/utils/logger';

const BUTTON_ID = 100;
let running = false;

let traceUntil = 0;

const triggerPipeline = async source => {
  if (running) {
    return;
  }
  running = true;
  try {
    markT0();
    traceUntil = Date.now() + 2000;
    log(`trigger (${source})`);
    await runHeaderActions();
  } finally {
    running = false;
  }
};

/**
 * Screen size in raw PIXELS. Motion events are raw px while Dimensions is
 * dp — ALWAYS multiply by PixelRatio (a density-1 device has ratio 1, so
 * the multiplication is a no-op there). A "looks like px already" guard
 * broke the Manta: 1024 dp × 1.875 = 1920 px, and 1024 tripped the guard.
 */
const screenPx = () => {
  const {width, height} = Dimensions.get('screen');
  const r = PixelRatio.get();
  return {width: width * r, height: height * r};
};

/** Hit-test the S-logo trigger zone (screen ratios — no page mapping). */
const isInsideTriggerZone = (x, y) => {
  const {width, height} = screenPx();
  return (
    x >= TRIGGER_SCREEN_ZONE.left * width &&
    x <= TRIGGER_SCREEN_ZONE.right * width &&
    y >= TRIGGER_SCREEN_ZONE.top * height &&
    y <= TRIGGER_SCREEN_ZONE.bottom * height
  );
};

const detector = createDoubleTapDetector({isInside: isInsideTriggerZone});

/** Track DOWN→UP pairs to qualify finger taps, then feed the detector. */
let down = null;
const onMotionMsg = msg => {
  try {
    const p = (msg.pointers && msg.pointers[0]) || msg;
    const tool = p.toolType != null ? p.toolType : msg.toolType;
    // Diagnostic: trace every event the system processes right after the
    // trigger — shows whether taps are still being resolved while our
    // lasso is active (paste-race hypothesis).
    if (Date.now() < traceUntil && msg.action !== 2) {
      log(
        `motion trace: action=${msg.action} tool=${tool} x=${Math.round(p.x != null ? p.x : msg.x)} y=${Math.round(p.y != null ? p.y : msg.y)}`,
      );
    }
    if (tool !== 1) {
      return; // finger only — never trigger from the EMR pen
    }
    const x = p.x != null ? p.x : msg.x;
    const y = p.y != null ? p.y : msg.y;
    if (msg.action === 0) {
      down = {x, y, t: Date.now()};
      return;
    }
    if (msg.action !== 1 || !down) {
      return;
    }
    const dt = Date.now() - down.t;
    const moved = Math.hypot(x - down.x, y - down.y);
    down = null;
    if (dt > 400 || moved > 40) {
      return; // drag/long-press, not a tap
    }
    // Calibration probe: log taps near the trigger corner (top-left 25%).
    const {width, height} = screenPx();
    if (y < height / 4 && x < width * 0.3) {
      log(
        `tap probe: x=${Math.round(x)} y=${Math.round(y)} inZone=${isInsideTriggerZone(x, y)}`,
      );
      flushLog('TAP');
    }
    if (detector(x, y, Date.now())) {
      triggerPipeline('double-tap');
    }
  } catch (e) {
    log(`motion handler error: ${e.message}`);
  }
};

const boot = async () => {
  try {
    AppRegistry.registerComponent(appName, () => App);
    log('registerComponent OK');

    PluginManager.init();
    log('PluginManager.init OK');
    {
      const dp = Dimensions.get('screen');
      const px = screenPx();
      log(
        `screen: ${dp.width}x${dp.height} dp × ratio ${PixelRatio.get()} = ${px.width}x${px.height} px`,
      );
    }

    try {
      await loadConfig();
      log('config preloaded');
    } catch (e) {
      log(`config preload failed: ${e.message}`);
    }

    // PluginHost never deletes old plugin versions (install artifacts stack
    // forever in the plugin dir). Clean everything but the running version.
    // Ref: user's report — reddit.com/r/Supernote_dev/comments/1uo2y0g/
    try {
      const dir = await PluginManager.getPluginDirPath();
      if (dir && NativeModules.PluginJanitor) {
        const r = await NativeModules.PluginJanitor.cleanupOldVersions(dir);
        log(
          `janitor: freed ${(r.freed / 1048576).toFixed(1)} MB, kept app_${
            r.kept
          } (${dir})`,
        );
      } else {
        log(
          `janitor skipped: dir=${dir} module=${!!NativeModules.PluginJanitor}`,
        );
      }
    } catch (e) {
      log(`janitor failed: ${e.message}`);
    }

    // No more auto-shown bubble (stale bubbles stack across reinstalls and
    // it floats over every app). Defensive hide of this instance's bubble;
    // orphans from older instances only disappear on device reboot.
    try {
      bubbleHide();
    } catch (_) {}

    let iconUri;
    try {
      const resolved = Image.resolveAssetSource(require('./assets/icon.png'));
      iconUri = resolved ? resolved.uri : undefined;
    } catch (e) {
      log(`icon resolve failed: ${e.message}`);
    }

    // Toolbar button opens the CONFIG screen (showType 1).
    try {
      const btnRes = await PluginManager.registerButton(1, ['NOTE'], {
        id: BUTTON_ID,
        name: JSON.stringify({
          en: 'SuperTemplate',
          zh_CN: 'SuperTemplate',
          zh_TW: 'SuperTemplate',
          ja: 'SuperTemplate',
        }),
        showType: 1,
        ...(iconUri ? {icon: iconUri} : {}),
      });
      log(`registerButton result: ${JSON.stringify(btnRes)}`);
    } catch (e) {
      log(`registerButton FAILED: ${e.message}`);
    }

    // Double-tap trigger on the template's S logo (top-right corner).
    try {
      if (typeof PluginManager.registerMotionListener === 'function') {
        PluginManager.registerMotionListener(1, {onMsg: onMotionMsg});
        log('registerMotionListener OK — double-tap on the S logo armed');
      } else {
        log('registerMotionListener NOT AVAILABLE — no double-tap trigger');
      }
    } catch (e) {
      log(`registerMotionListener failed: ${e.message}`);
    }
  } catch (e) {
    log(`BOOT CRASH: ${e.name}: ${e.message}\n${e.stack}`);
  } finally {
    await flushLog('BOOT');
  }
};

boot();
