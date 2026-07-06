/**
 * Pure double-tap detector (no native imports — unit-testable).
 *
 * Feed it completed taps (x, y, timestamp); it returns true when two
 * successive taps land inside the target zone within the time/distance
 * window. A tap outside the zone resets the sequence.
 */

/**
 * @param {object} opts
 * @param {(x:number, y:number) => boolean} opts.isInside Zone hit-test.
 * @param {number} [opts.minDelayMs] Min delay between the two taps — a FAST
 *   double-tap is the system's paste gesture (and header toggle) on the
 *   note canvas; our listener is observe-only and cannot consume events,
 *   so the trigger must live outside the system's ~300 ms window.
 * @param {number} [opts.maxDelayMs] Max delay between the two taps.
 * @param {number} [opts.maxDistPx] Max distance between the two taps.
 * @returns {(x:number, y:number, t:number) => boolean} Call per tap; true = double-tap.
 */
export function createDoubleTapDetector({
  isInside,
  minDelayMs = 0,
  maxDelayMs = 1600,
  maxDistPx = 80,
}) {
  let last = null;
  return function onTap(x, y, t) {
    if (!isInside(x, y)) {
      last = null;
      return false;
    }
    if (
      last &&
      t - last.t >= minDelayMs &&
      t - last.t <= maxDelayMs &&
      Math.hypot(x - last.x, y - last.y) <= maxDistPx
    ) {
      last = null;
      return true;
    }
    last = {x, y, t};
    return false;
  };
}
