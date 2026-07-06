/**
 * Hotzone definitions for the SuperTemplate_simpleNote.png template.
 *
 * Coordinates were measured on the template PNG (1920 x 2560) and are stored
 * as ratios of the page size, so they hold for any device resolution — the
 * pixel rects are computed at runtime from PluginFileAPI.getPageSize().
 *
 * Measured features:
 * - two dashed tick marks at x=775 and x=1317, y 30..100 → datetime zone
 * - solid title box borders: x 453..1867, y 130..289 → title zone
 */

const TEMPLATE_W = 1920;
const TEMPLATE_H = 2560;

export const ZONES = {
  datetime: {
    left: 776 / TEMPLATE_W,
    top: 16 / TEMPLATE_H,
    right: 1317 / TEMPLATE_W,
    bottom: 126 / TEMPLATE_H,
  },
  title: {
    left: 453 / TEMPLATE_W,
    top: 130 / TEMPLATE_H,
    right: 1867 / TEMPLATE_W,
    bottom: 289 / TEMPLATE_H,
  },
};

/**
 * Double-tap trigger zone, in SCREEN ratios: the S logo printed in the
 * white space LEFT of the title box (x 250–354, y 158–262 on the 1920×2560
 * PNG → ratios x 0.130–0.184, y 0.062–0.102) plus margins. Tap-probe data
 * showed the page maps to the screen with a pure scale factor (no toolbar
 * offset), but Dimensions returns dp while motion events are raw pixels —
 * hit-tests must multiply Dimensions by PixelRatio.get().
 * NOTE: the page's very top strip is a SYSTEM double-tap zone (toggles the
 * note name/page number header) — never place the trigger there.
 */
export const TRIGGER_SCREEN_ZONE = {
  left: 0.11,
  top: 0.035,
  right: 0.205,
  bottom: 0.13,
};

/**
 * Convert a ratio zone to a pixel Rect for the given page size.
 * @param {{left:number,top:number,right:number,bottom:number}} zone Ratio zone.
 * @param {{width:number,height:number}} pageSize Page size in pixels.
 * @returns {{left:number,top:number,right:number,bottom:number}} Pixel rect.
 */
export function zoneToRect(zone, pageSize) {
  return {
    left: Math.round(zone.left * pageSize.width),
    top: Math.round(zone.top * pageSize.height),
    right: Math.round(zone.right * pageSize.width),
    bottom: Math.round(zone.bottom * pageSize.height),
  };
}
