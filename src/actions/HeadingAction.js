import {PluginCommAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {HEADING_FONTS} from '../config';
import {classifyMarkup, styleForMarkup} from '../utils/markup';
import {log} from '../utils/logger';

/** Extract a stroke bounding box from a materialized element (multi-path —
 * firmware variants populate different fields; units don't matter, the
 * markup classifier works in ratios). */
function strokeBBox(m) {
  const rr =
    m.recognizeResult ||
    (m.angles && m.angles.contoursSrc && m.angles.contoursSrc.recognizeResult);
  if (rr && rr.up_left_point_x != null) {
    return {
      left: rr.up_left_point_x,
      top: rr.up_left_point_y,
      right: rr.down_right_point_x,
      bottom: rr.down_right_point_y,
    };
  }
  if (m.minX != null && m.maxX != null && m.minY != null && m.maxY != null) {
    return {left: m.minX, top: m.minY, right: m.maxX, bottom: m.maxY};
  }
  if (m.rect && m.rect.left != null) {
    return m.rect;
  }
  return null;
}

/**
 * Convert the title-zone content into a native Supernote heading.
 *
 * Handwriting mode: lasso the zone (UI hidden) → OCR probe (logged only) →
 * setLassoTitle on the strokes.
 *
 * OCR mode: lasso → recognize → insert the recognized text as a typed text
 * box → re-lasso (strokes + text box) → setLassoTitle on both. The original
 * handwriting is NOT deleted here: mid-pipeline deletions free numInPage
 * slots that the firmware ghost-paste then reuses (which blinded the
 * paste-guard). Instead `out.deleteHandwriting`/`out.strokeNums` tell the
 * caller to remove the strokes in the single end-of-pipeline cleanup pass
 * (one deleteElements + one reloadFile for everything).
 *
 * Firmware notes: deleteLassoElements is a CUT (loads the ghost buffer, no
 * file persistence) — never use it. setLassoTitle consumes the lasso; any
 * setLassoBoxState(2) after it fails with code 904.
 *
 * @param {{path:string,pageNum:number,pageSize:{width:number,height:number},config:object}} ctx
 * @param {{left:number,top:number,right:number,bottom:number}} rect Pixel rect of the title zone.
 * @returns {Promise<{converted:boolean, ocrText:string|null, strokeNums:number[], deleteHandwriting:boolean}>}
 */
export async function runHeadingAction(ctx, rect) {
  const out = {
    converted: false,
    ocrText: null,
    strokeNums: [],
    deleteHandwriting: false,
    lassoConsumed: false,
    markupStyle: 0,
  };

  // The title box starts only ~4 px below the datetime zone on the template:
  // a full-rect lasso would also grab the date text box. Select from 15%
  // below the top edge so only the box's content is captured.
  const h = rect.bottom - rect.top;
  const lassoRect = {
    left: rect.left,
    top: rect.top + Math.round(h * 0.15),
    right: rect.right,
    bottom: rect.bottom,
  };

  const lassoRes = await PluginCommAPI.lassoElements(lassoRect);
  log(`lassoElements(${JSON.stringify(lassoRect)}) → ${JSON.stringify(lassoRes)}`);
  if (!lassoRes || lassoRes.success !== true) {
    log('HEADING: programmatic lasso unavailable — aborting action.');
    return out;
  }
  await hideLassoUi();

  try {
    const countsRes = await PluginCommAPI.getLassoElementTypeCounts();
    log(`getLassoElementTypeCounts → ${JSON.stringify(countsRes)}`);
    const counts = (countsRes && countsRes.result) || {};

    if ((counts.titleNum || 0) > 0) {
      log('HEADING: zone already contains a title — skipping (idempotent).');
      return out;
    }
    if ((counts.trailNum || 0) === 0) {
      log('HEADING: no strokes in the title zone — nothing to convert.');
      return out;
    }

    // OCR probe — strokes are still raw here, ideal moment to recognize.
    let lassoElements = null;
    try {
      const elsRes = await PluginCommAPI.getLassoElements();
      lassoElements = (elsRes && elsRes.result) || null;
      log(
        `getLassoElements → success=${elsRes && elsRes.success} count=${
          lassoElements ? lassoElements.length : 'n/a'
        }`,
      );
      if (lassoElements && lassoElements.length > 0) {
        const bboxes = [];
        let firstDumped = false;
        for (const el of lassoElements) {
          try {
            const m = JSON.parse(JSON.stringify(el));
            if (m && m.numInPage != null) {
              out.strokeNums.push(m.numInPage);
            }
            const bb = strokeBBox(m);
            bboxes.push(bb);
            if (!bb && !firstDumped) {
              firstDumped = true;
              log(`markup: no bbox on stroke — dump: ${JSON.stringify(m).slice(0, 500)}`);
            }
          } catch (_) {
            bboxes.push(null);
          }
        }
        log(`lasso stroke nums: ${JSON.stringify(out.strokeNums)}`);

        // Markup detection: underline(s) under the title pick the heading
        // style on the fly. Unit-agnostic (ratio-based classifier).
        const validBoxes = bboxes.filter(Boolean);
        let underlineCount = 0;
        let ocrInput = lassoElements;
        if (validBoxes.length === bboxes.length && bboxes.length >= 2) {
          const {underlineIdx} = classifyMarkup(bboxes);
          underlineCount = underlineIdx.length;
          log(
            `markup: ${bboxes.length} stroke bbox(es), underlines=${underlineCount}` +
              (underlineCount
                ? ` ${JSON.stringify(underlineIdx.map(i => bboxes[i]))}`
                : ''),
          );
          if (underlineCount > 0) {
            const skip = new Set(underlineIdx);
            ocrInput = lassoElements.filter((_, i) => !skip.has(i));
          }
        } else {
          log(
            `markup: bbox extraction incomplete (${validBoxes.length}/${bboxes.length}) — detection skipped.`,
          );
        }
        out.markupStyle = styleForMarkup(underlineCount, ctx.config);

        const ocrRes = await PluginCommAPI.recognizeElements(
          ocrInput,
          ctx.pageSize,
        );
        log(`OCR probe recognizeElements → ${JSON.stringify(ocrRes)}`);
        if (ocrRes && ocrRes.success && typeof ocrRes.result === 'string') {
          out.ocrText = ocrRes.result;
        }
      }
    } catch (e) {
      log(`OCR probe failed (non-fatal): ${e.message}`);
    } finally {
      if (lassoElements) {
        for (const el of lassoElements) {
          try {
            if (el && typeof el.recycle === 'function') {
              el.recycle();
            }
          } catch (_) {}
        }
      }
    }

    if (ctx.config.headingOcr && out.ocrText && (counts.normalTextBoxNum || 0) > 0) {
      // Safety net: a text box (most likely the date stamp) is inside the
      // selection — replacing would destroy it. Keep the handwriting.
      log('HEADING: text box in selection — skipping OCR replacement to protect it.');
    }
    if (
      ctx.config.headingOcr &&
      out.ocrText &&
      (counts.normalTextBoxNum || 0) === 0
    ) {
      // Close the current lasso cleanly (not consumed yet — this succeeds),
      // insert the typed text, then re-select so the heading conversion
      // covers strokes + text box together. The strokes are removed later
      // by the caller's single cleanup pass.
      try {
        const closeRes = await PluginCommAPI.setLassoBoxState(2);
        log(`setLassoBoxState(2) before insert → ${JSON.stringify(closeRes)}`);
      } catch (_) {}

      const fontDef = HEADING_FONTS.find(
        f => f.key === (ctx.config.headingFont || 'default'),
      );
      const fontPath = (fontDef && fontDef.path) || undefined;
      // Vertically centered inside the box, with side margins — not glued
      // to the top edge (and clearly clear of the datetime zone above).
      const textRect = {
        left: rect.left + 16,
        top: rect.top + Math.round(h * 0.22),
        right: rect.right - 16,
        bottom: rect.bottom - Math.round(h * 0.1),
      };
      const insRes = await PluginNoteAPI.insertText({
        textContentFull: out.ocrText,
        textRect,
        fontSize: ctx.config.headingFontSize || 48,
        textBold: 1,
        ...(fontPath ? {fontPath} : {}),
      });
      log(`insertText(heading "${out.ocrText}") → ${JSON.stringify(insRes)}`);
      out.deleteHandwriting = !!(insRes && insRes.success);

      const relasso = await PluginCommAPI.lassoElements(lassoRect);
      log(`re-lasso for heading → ${JSON.stringify(relasso)}`);
      if (!relasso || relasso.success !== true) {
        out.converted = !!(insRes && insRes.success);
        out.lassoConsumed = true; // no active lasso left behind
        return out;
      }
      await hideLassoUi();
    } else if (ctx.config.headingOcr && !out.ocrText) {
      log('HEADING: OCR on but recognition returned nothing — keeping handwriting.');
    }

    // Diagnostic: re-read the selection content just before styling.
    try {
      const counts2 = await PluginCommAPI.getLassoElementTypeCounts();
      log(`counts BEFORE setLassoTitle → ${JSON.stringify(counts2 && counts2.result)}`);
    } catch (e) {
      log(`second counts read failed: ${e.message}`);
    }

    const style = out.markupStyle || ctx.config.headingStyle || 1;
    const titleRes = await PluginNoteAPI.setLassoTitle({style});
    log(`setLassoTitle({style:${style}}) → ${JSON.stringify(titleRes)}`);
    out.converted = !!(titleRes && titleRes.success);
    out.lassoConsumed = true;
  } finally {
    if (!out.lassoConsumed) {
      try {
        const clearRes = await PluginCommAPI.setLassoBoxState(2);
        log(`setLassoBoxState(2) → ${JSON.stringify(clearRes)}`);
      } catch (e) {
        log(`setLassoBoxState(2) failed: ${e.message}`);
      }
    }
  }

  return out;
}

/**
 * Hide the lasso selection overlay while we work (state 3 keeps the lasso
 * alive, 0.1.43+) — one visual flash less per lasso cycle.
 */
async function hideLassoUi() {
  try {
    const res = await PluginCommAPI.setLassoBoxState(3);
    log(`setLassoBoxState(3) hide UI → ${JSON.stringify(res)}`);
  } catch (e) {
    log(`setLassoBoxState(3) failed (non-fatal): ${e.message}`);
  }
}
