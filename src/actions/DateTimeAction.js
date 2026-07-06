import {PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {log} from '../utils/logger';
import {formatStamp, formatKeyword, looksLikeStamp} from '../utils/datetime';

const TYPE_TEXT = 500;

/** Extract a pixel rect from a materialized element, trying known shapes. */
function elementRect(el) {
  const rr =
    el.recognizeResult ||
    (el.angles && el.angles.contoursSrc && el.angles.contoursSrc.recognizeResult);
  if (rr && rr.up_left_point_x != null) {
    return {
      left: rr.up_left_point_x,
      top: rr.up_left_point_y,
      right: rr.down_right_point_x,
      bottom: rr.down_right_point_y,
    };
  }
  const tr = el.textBox && el.textBox.textRect;
  if (tr && tr.left != null) {
    return tr;
  }
  if (el.textRect && el.textRect.left != null) {
    return el.textRect;
  }
  return null;
}

/** Extract text content from a materialized element, trying known shapes. */
function elementText(el) {
  return (
    (el.textBox && el.textBox.textContentFull) ||
    el.textContentFull ||
    (el.textBox && el.textBox.textContent) ||
    null
  );
}

function rectsIntersect(a, b) {
  return !(
    b.left > a.right ||
    b.right < a.left ||
    b.top > a.bottom ||
    b.bottom < a.top
  );
}

/**
 * Insert the current datetime as a centered text box in the datetime zone.
 *
 * Idempotence (an existing date is NEVER touched — the user must delete it
 * to re-stamp):
 *  1. any text element whose rect intersects the datetime zone → skip;
 *  2. any text element whose content looks like a datetime stamp → skip;
 *  3. legacy guard: a date keyword already registered on the page → skip.
 *
 * @param {{path:string,pageNum:number,config:object}} ctx
 * @param {{left:number,top:number,right:number,bottom:number}} rect Pixel rect of the datetime zone.
 * @returns {Promise<{inserted:boolean}>}
 */
export async function runDateTimeAction(ctx, rect) {
  const out = {inserted: false};
  const now = new Date();

  try {
    const elsRes = await PluginFileAPI.getElements(ctx.pageNum, ctx.path);
    const raw = (elsRes && Array.isArray(elsRes.result) && elsRes.result) || [];
    const texts = raw
      .map(el => {
        let m = el;
        try {
          m = JSON.parse(JSON.stringify(el));
        } catch (_) {}
        try {
          if (el && typeof el.recycle === 'function') {
            el.recycle();
          }
        } catch (_) {}
        return m;
      })
      .filter(el => el.type === TYPE_TEXT);
    for (const el of texts) {
      const r = elementRect(el);
      if (r && rectsIntersect(r, rect)) {
        log(
          `DATETIME: existing text element in zone (${JSON.stringify(r)}) — skipping.`,
        );
        return out;
      }
      const content = elementText(el);
      if (looksLikeStamp(content)) {
        log(`DATETIME: existing stamp-like text "${content}" — skipping.`);
        return out;
      }
    }
    log(`DATETIME: ${texts.length} text element(s) on page, none in zone.`);
    if (texts.length > 0) {
      // Firmware-shape diagnostics: if the guards above missed a stamp,
      // this dump shows which fields this firmware actually populates.
      log(`  first text element: ${JSON.stringify(texts[0]).slice(0, 600)}`);
    }
  } catch (e) {
    log(`DATETIME element scan failed (continuing): ${e.message}`);
  }

  try {
    const kwRes = await PluginFileAPI.getKeyWords(ctx.path);
    const keywords = (kwRes && kwRes.result) || [];
    const alreadyStamped = keywords.some(
      kw =>
        kw &&
        kw.page === ctx.pageNum &&
        typeof kw.keyword === 'string' &&
        /^\d{8}$|^\d{4}-\d{2}(-\d{2})?$|^\d{2}\/\d{2}\/\d{4}$/.test(kw.keyword),
    );
    if (alreadyStamped) {
      log('DATETIME: date keyword already on page — skipping (idempotent).');
      return out;
    }
  } catch (e) {
    log(`getKeyWords failed (continuing): ${e.message}`);
  }

  const stamp = formatStamp(now, ctx.config.dateFormat, ctx.config.language);

  // Auto-fit: long formats at large sizes wrap to a second line that the
  // zone clips. Shrink the font so the stamp fits on ONE line in the zone
  // (estimated glyph width ≈ 0.55 em), capped by the zone height.
  const zoneW = rect.right - rect.left;
  const zoneH = rect.bottom - rect.top;
  let fontSize = ctx.config.fontSize;
  const estWidth = Math.ceil(stamp.length * 0.55 * fontSize);
  if (estWidth > zoneW) {
    fontSize = Math.max(20, Math.floor(zoneW / (stamp.length * 0.55)));
    log(`DATETIME: font auto-fit ${ctx.config.fontSize} → ${fontSize} (stamp ${stamp.length} chars, zone ${zoneW}px)`);
  }
  if (fontSize > Math.floor(zoneH * 0.8)) {
    fontSize = Math.floor(zoneH * 0.8);
  }

  const insertRes = await PluginNoteAPI.insertText({
    textContentFull: stamp,
    textRect: rect,
    fontSize,
    textAlign: 1,
  });
  log(`insertText("${stamp}") → ${JSON.stringify(insertRes)}`);
  out.inserted = !!(insertRes && insertRes.success);

  if (out.inserted && ctx.config.keyword) {
    try {
      const kw = formatKeyword(now, ctx.config.keywordFormat);
      const kwInsRes = await PluginFileAPI.insertKeyWord(
        ctx.path,
        ctx.pageNum,
        kw,
      );
      log(`insertKeyWord("${kw}") → ${JSON.stringify(kwInsRes)}`);
    } catch (e) {
      log(`insertKeyWord failed (non-fatal): ${e.message}`);
    }
  }

  return out;
}
