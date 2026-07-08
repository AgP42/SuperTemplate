/**
 * Pure handwriting-markup classifier (no native imports — unit-testable).
 *
 * V1 detects UNDERLINES only — the most reliably detectable gesture with
 * bounding boxes alone: a stroke that is wide (vs the whole title), flat,
 * and sitting in the lower band of the title's stroke cluster. All
 * thresholds are RELATIVE to the cluster's union box, so the result is
 * independent of the firmware's coordinate units (EMR or pixels).
 */

const FLAT_MAX_HEIGHT_RATIO = 0.18; // stroke height ≤ 18% of cluster height
const WIDE_MIN_WIDTH_RATIO = 0.35; // stroke width ≥ 35% of cluster width
const LOW_BAND_START_RATIO = 0.55; // stroke center in the bottom 45%

/**
 * @param {Array<{left:number,top:number,right:number,bottom:number}>} bboxes
 *   One bounding box per stroke, any consistent unit.
 * @returns {{underlineIdx: number[]}} Indices of strokes classified as
 *   underline marks (0, 1 = single, 2+ = double underline).
 */
export function classifyMarkup(bboxes) {
  if (!Array.isArray(bboxes) || bboxes.length < 2) {
    return {underlineIdx: []};
  }

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const b of bboxes) {
    if (b.left < left) {
      left = b.left;
    }
    if (b.top < top) {
      top = b.top;
    }
    if (b.right > right) {
      right = b.right;
    }
    if (b.bottom > bottom) {
      bottom = b.bottom;
    }
  }
  const clusterW = right - left;
  const clusterH = bottom - top;
  if (clusterW <= 0 || clusterH <= 0) {
    return {underlineIdx: []};
  }

  const underlineIdx = [];
  bboxes.forEach((b, i) => {
    const w = b.right - b.left;
    const h = b.bottom - b.top;
    const centerY = (b.top + b.bottom) / 2;
    if (
      h <= clusterH * FLAT_MAX_HEIGHT_RATIO &&
      w >= clusterW * WIDE_MIN_WIDTH_RATIO &&
      centerY >= top + clusterH * LOW_BAND_START_RATIO
    ) {
      underlineIdx.push(i);
    }
  });

  // If everything qualifies (e.g. a page of horizontal dashes), there is no
  // "text above" to decorate — treat as no markup.
  if (underlineIdx.length >= bboxes.length) {
    return {underlineIdx: []};
  }

  return {underlineIdx};
}

/**
 * Pick the heading style from the detected markup.
 * @param {number} underlineCount
 * @param {{headingStyle:number, styleUnderline:number, styleDoubleUnderline:number}} config
 * @returns {number} setLassoTitle style code (1-4).
 */
export function styleForMarkup(underlineCount, config) {
  if (underlineCount >= 2) {
    return config.styleDoubleUnderline || 4;
  }
  if (underlineCount === 1) {
    return config.styleUnderline || 2;
  }
  return config.headingStyle || 1;
}
