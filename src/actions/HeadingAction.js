import {PluginCommAPI, PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {resolveHeadingFontPath} from '../config';
import {classifyMarkup, styleForMarkup} from '../utils/markup';
import {looksLikeStamp} from '../utils/datetime';
import {toast} from '../utils/toast';
import {log} from '../utils/logger';

/**
 * Convert the page's title (handwriting or typed text) into a native
 * Supernote heading.
 *
 * Strategy (v0.13.5, user's spec): every stroke TOUCHING the printed title
 * box is title ink; the selection rect GROWS to contain those strokes
 * fully, and conversion is refused when the grown rect collides with other
 * writing. No ink in the box but a typed text box → that box is converted.
 *
 * Firmware rules this code is built on (all field-proven):
 * - lassoElements: PAGE coordinates, selects strokes by FULL containment,
 *   rejects rects exceeding the page (result:false).
 * - TEXT BOXES ignore containment and enter any overlapping selection →
 *   every text box in the selection is rescued (captured, temporarily
 *   file-deleted, re-inserted identically after the conversion).
 * - insertText: DISPLAY coordinates (page + centering offset on foreign
 *   pages — ctx.displayOff).
 * - deleteLassoElements is a CUT (loads the ghost paste buffer) and does
 *   not persist — never used; file-level deleteElements + reloadFile is.
 * - setLassoTitle consumes the lasso (further lasso calls fail with 904).
 * - A loaded lasso COPY buffer is pasted into the page on EVERY lasso
 *   creation (Ratta-confirmed bug); pasted strokes get absorbed by a
 *   title created afterwards, and deleting them then EMPTIES the heading
 *   in the recap → abortIfBufferPasted() runs before every setLassoTitle.
 *
 * @param {{path:string,pageNum:number,pageSize:object,config:object,displayOff:{x:number,y:number},numsAtStart:number[],titleBoxPage:object}} ctx
 * @returns {Promise<{converted:boolean, ocrText:string|null, strokeNums:number[], deleteHandwriting:boolean}>}
 */
export async function runHeadingAction(ctx) {
  const out = {
    converted: false,
    ocrText: null,
    strokeNums: [],
    deleteHandwriting: false,
    lassoConsumed: false,
    markupStyle: 0,
    selfDeleted: 0,
    intendedNums: [],
  };

  // ── 0. Idempotence: a heading already overlapping the title box means
  // the page is done — re-triggering must be a no-op. This is the ONLY
  // reliable signal: converted titles vanish from element enumeration
  // after save/reload and the lasso never reports titleNum, so re-runs
  // used to stack a second title element on the same strokes.
  try {
    const tRes = await PluginFileAPI.getTitles(ctx.path, [ctx.pageNum]);
    const titles = (tRes && Array.isArray(tRes.result) && tRes.result) || [];
    for (const t of titles) {
      let m = t;
      try {
        m = JSON.parse(JSON.stringify(t));
      } catch (_) {}
      // Telemetry: the exact shape of existing titles (esp. TEXT titles)
      // teaches us how to file-insert them — see insertTitleFileLevel.
      log(`title on page: ${JSON.stringify(m).slice(0, 300)}`);
      // Title.page is 0-based while getCurrentPageNum is 1-based on this
      // firmware (field dump: title.page 13 on ctx.pageNum 14) — accept
      // both bases.
      if (
        m &&
        m.X != null &&
        (m.page == null ||
          m.page === ctx.pageNum ||
          m.page === ctx.pageNum - 1)
      ) {
        const r = {
          left: m.X,
          top: m.Y,
          right: m.X + (m.width || 0),
          bottom: m.Y + (m.height || 0),
        };
        if (rectsOverlap(r, ctx.titleBoxPage)) {
          log(
            `HEADING: existing title at ${JSON.stringify(r)} (style ${m.style}) — skipping (idempotent).`,
          );
          toast('SuperTemplate: this page already has its heading.');
          return out;
        }
      }
    }
    log(`getTitles: ${titles.length} title(s) on page, none in the title box.`);
  } catch (e) {
    log(`getTitles failed (continuing): ${e.message}`);
  }

  // ── 1. Find the title cluster from the page's own strokes ──────────────
  const cluster = await findTitleCluster(ctx);
  if (!cluster) {
    return out; // reason already logged
  }
  const fitted = cluster.rect;
  out.fittedRect = fitted; // for the end-guard title repair

  // ── 2. Select it (fitted rect ⇒ containment holds by construction) ────
  let lassoRes = await PluginCommAPI.lassoElements(fitted);
  log(`lassoElements(fitted ${JSON.stringify(fitted)}) → ${JSON.stringify(lassoRes)}`);
  if (!lassoRes || lassoRes.success !== true || lassoRes.result !== true) {
    log('HEADING: nothing selectable in the title box — skipping.');
    toast('SuperTemplate: title box is empty.');
    return out;
  }
  await hideLassoUi();

  try {
    let selection = await readSelection(out);
    if (out.strokeNums.length === 0) {
      // No ink in the box — but a typed title (e.g. left by a previous OCR
      // run) must still become a heading (user's spec 2026-07-14).
      return await headTypedTitle(ctx, out, selection);
    }

    // The END CONTRACT (verified in runHeaderActions after conversion):
    // the created heading must contain exactly these strokes. The scan's
    // members are the intent when trustworthy; the lasso selection is the
    // fallback (bbox-less strokes make the scan incomplete).
    out.intendedNums =
      Array.isArray(cluster.memberNums) &&
      cluster.memberNums.length > 0 &&
      cluster.unboxed === 0
        ? cluster.memberNums.slice()
        : out.strokeNums.slice();

    // ── 3. Rescue EVERY text box out of the selection ────────────────────
    if (selection.boxes.length > 0) {
      log(
        `HEADING: rescuing ${selection.boxes.length} text box(es) out of the selection (nums ${JSON.stringify(selection.boxes.map(b => b.num))}).`,
      );
      try {
        await PluginCommAPI.setLassoBoxState(2);
      } catch (_) {}
      const delRes = await PluginFileAPI.deleteElements(
        ctx.path,
        ctx.pageNum,
        selection.boxes.map(b => b.num),
      );
      log(`rescue deleteElements → ${JSON.stringify(delRes)}`);
      const rl = await PluginCommAPI.reloadFile();
      log(`rescue reloadFile → ${JSON.stringify(rl)}`);
      out.rescued = selection.boxes;

      lassoRes = await PluginCommAPI.lassoElements(fitted);
      log(`re-lasso after rescue → ${JSON.stringify(lassoRes)}`);
      if (!lassoRes || lassoRes.result !== true) {
        log('HEADING: re-lasso after rescue caught nothing — aborting.');
        out.lassoConsumed = true;
        return out;
      }
      await hideLassoUi();
      for (const stale of selection.elements) {
        try {
          if (stale && typeof stale.recycle === 'function') {
            stale.recycle();
          }
        } catch (_) {}
      }
      selection = await readSelection(out); // fresh nums (page renumbered)
      if (selection.boxes.length > 0) {
        log('HEADING: text boxes still present after rescue — aborting.');
        try {
          await PluginCommAPI.setLassoBoxState(2);
        } catch (_) {}
        out.lassoConsumed = true;
        return out;
      }
    }
    if (out.strokeNums.length === 0) {
      log('HEADING: no strokes in the selection — nothing to convert.');
      return out;
    }

    // ── 4. Markup (underline → style) + OCR ──────────────────────────────
    const {underlineIdx} = selection.bboxes.every(Boolean)
      ? classifyMarkup(selection.bboxes)
      : {underlineIdx: []};
    log(
      `markup: ${selection.bboxes.length} stroke(s), underlines=${underlineIdx.length}`,
    );
    out.markupStyle = styleForMarkup(underlineIdx.length, ctx.config);
    const skipIdx = new Set(underlineIdx);
    const ocrInput = selection.elements.filter((_, i) => !skipIdx.has(i));
    try {
      const ocrRes = await PluginCommAPI.recognizeElements(
        ocrInput,
        ctx.pageSize,
      );
      log(`OCR probe recognizeElements → ${JSON.stringify(ocrRes)}`);
      if (ocrRes && ocrRes.success && typeof ocrRes.result === 'string') {
        out.ocrText = ocrRes.result;
      }
    } catch (e) {
      log(`OCR probe failed (non-fatal): ${e.message}`);
    } finally {
      for (const el of selection.elements) {
        try {
          if (el && typeof el.recycle === 'function') {
            el.recycle();
          }
        } catch (_) {}
      }
    }

    // ── 5. Optional OCR replacement (guarded) ────────────────────────────
    const looksLikeTitle =
      !!out.ocrText &&
      out.ocrText.trim().split('\n').length <= 2 &&
      out.strokeNums.length <= 40;
    if (ctx.config.headingOcr && out.ocrText && !looksLikeTitle) {
      log(
        `HEADING: selection does not look like a title (${out.ocrText.trim().split('\n').length} line(s), ${out.strokeNums.length} strokes) — OCR replacement refused.`,
      );
      toast(
        'SuperTemplate: selection looks bigger than a title — OCR replacement skipped for safety.',
      );
    }
    if (ctx.config.headingOcr && out.ocrText && looksLikeTitle) {
      // Typed text FIRST, ink deleted only once the text is confirmed on
      // the page, heading applied to the CLEAN text — never to the mixed
      // strokes+text pair (that produced partially-rendered headings in
      // the device's heading overview).
      try {
        await PluginCommAPI.setLassoBoxState(2);
      } catch (_) {}
      const fontPath = resolveHeadingFontPath(ctx.config.headingFont);
      const off = ctx.displayOff || {x: 0, y: 0};
      // Size the text rect to the TEXT, not to the lasso band: a text box
      // spanning the whole band converts into a huge heading with a small
      // top-left caption (field screenshot 2026-07-14). Estimated glyph
      // width ≈ 0.55 em (same heuristic as the datetime stamp), vertically
      // centered in the printed box.
      const boxRect = ctx.titleBoxPage;
      const boxW = boxRect.right - boxRect.left;
      const boxHh = boxRect.bottom - boxRect.top;
      let fontSize = ctx.config.headingFontSize || 90;
      const lines = out.ocrText.split('\n');
      const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
      if (Math.ceil(longest * 0.55 * fontSize) + fontSize > boxW) {
        fontSize = Math.max(24, Math.floor(boxW / (longest * 0.55 + 1)));
        log(`OCR: heading font auto-fit (width) → ${fontSize}`);
      }
      // Large sizes (Supernote scale, up to 180) don't fit the printed box
      // height — the text may flow into the whitespace below it (one box
      // height deep, same band the stroke selection uses), never further.
      const maxH = Math.min(
        2 * boxHh,
        ctx.pageSize.height - boxRect.top,
      );
      if (Math.round(fontSize * 1.4) * lines.length > maxH) {
        fontSize = Math.max(
          24,
          Math.floor(maxH / (1.4 * lines.length)),
        );
        log(`OCR: heading font auto-fit (height) → ${fontSize}`);
      }
      const estW = Math.min(
        Math.ceil(longest * 0.55 * fontSize) + fontSize,
        boxW,
      );
      const textH = Math.round(fontSize * 1.4) * lines.length;
      const textTop =
        textH <= boxHh
          ? boxRect.top + Math.round((boxHh - textH) / 2)
          : boxRect.top;
      const insRes = await PluginNoteAPI.insertText({
        textContentFull: out.ocrText,
        textRect: {
          left: boxRect.left + off.x,
          top: textTop + off.y,
          right: boxRect.left + estW + off.x,
          bottom: textTop + textH + off.y,
        },
        fontSize,
        textBold: 1,
        ...(fontPath ? {fontPath} : {}),
      });
      log(`insertText(heading "${out.ocrText}") → ${JSON.stringify(insRes)}`);
      if (insRes && insRes.success) {
        const delRes = await PluginFileAPI.deleteElements(
          ctx.path,
          ctx.pageNum,
          out.strokeNums,
        );
        log(
          `OCR: delete handwriting ${JSON.stringify(out.strokeNums)} → ${JSON.stringify(delRes)}`,
        );
        if (delRes && delRes.success) {
          const rl = await PluginCommAPI.reloadFile();
          log(`OCR: reloadFile → ${JSON.stringify(rl)}`);
          out.deleteHandwriting = true;
          // The paste-guard's stroke-delta cap must know how many strokes
          // WE removed mid-pipeline, or firmware ghosts sneak under it (22
          // ghosts vs delta 15 = 22-7, field case 2026-07-14 18:09).
          out.selfDeleted = out.strokeNums.length;
          out.strokeNums = []; // already gone — nothing left for the end pass
          out.intendedNums = []; // the intent is now the inserted TEXT BOX
        } else {
          log('OCR: handwriting deletion FAILED — ink and typed text both on page, converting the pair.');
        }
      } else {
        log('OCR: insertText failed — keeping the ink, converting it natively.');
      }
      // Re-select what now occupies the box: the typed text on success
      // (text boxes enter any overlapping selection), the untouched ink
      // otherwise. The conversion below applies to either.
      const relasso = await PluginCommAPI.lassoElements(fitted);
      log(`re-lasso for heading → ${JSON.stringify(relasso)}`);
      if (!relasso || relasso.result !== true) {
        log('HEADING: re-lasso caught nothing — no heading applied.');
        out.lassoConsumed = true;
        return out;
      }
      await hideLassoUi();
    }

    // ── 6. Convert to a native heading ───────────────────────────────────
    // The firmware pastes a loaded copy buffer on this very call (lasso
    // consumption) and the new title ABSORBS the pasted strokes — they are
    // unregistered from the title and deleted afterwards by the end-of-run
    // guard (title repair in runHeaderActions), file-level, lasso-free.
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
      out.lassoConsumed = true;
    }
    // ── 7. Re-insert rescued text boxes, identically ─────────────────────
    if (out.rescued && out.rescued.length > 0) {
      await reinsertBoxes(out.rescued);
    }
  }

  return out;
}

/**
 * Title selection rect (user's spec 2026-07-14): every stroke TOUCHING the
 * printed box belongs to the title, wherever it ends — the rect GROWS to
 * contain those strokes fully (the firmware selects by full containment),
 * and the conversion is refused only when the grown rect collides with
 * OTHER writing on the page. No ink touching the box → the box verbatim
 * (typed-title path).
 */
async function findTitleCluster(ctx) {
  const box = ctx.titleBoxPage;
  if (!box) {
    log('HEADING: no title box configured — skipping.');
    return null;
  }
  const members = [];
  const others = [];
  let unboxed = 0;
  const classify = m => {
    if (m.type === 0) {
      const b = strokeBBox(m);
      if (!b) {
        unboxed++;
      } else if (rectsOverlap(b, box)) {
        members.push({num: m.numInPage, b});
      } else {
        others.push({num: m.numInPage, b});
      }
    }
  };
  try {
    if (Array.isArray(ctx.pageScan)) {
      // Shared per-element fallback scan (bulk getElements empty on this
      // page — see runHeaderActions).
      for (const m of ctx.pageScan) {
        classify(m);
      }
    } else {
      const els = await PluginFileAPI.getElements(ctx.pageNum, ctx.path);
      const arr = (els && Array.isArray(els.result) && els.result) || [];
      for (const el of arr) {
        try {
          classify(JSON.parse(JSON.stringify(el)));
        } catch (_) {}
        try {
          if (el && typeof el.recycle === 'function') {
            el.recycle();
          }
        } catch (_) {}
      }
    }
  } catch (e) {
    log(`HEADING page-scan failed (${e.message}) — using the box verbatim.`);
  }

  const boxH = box.bottom - box.top;
  const rect = {
    left: Math.max(0, box.left),
    top: Math.max(0, box.top),
    right: Math.min(ctx.pageSize.width, box.right),
    bottom: Math.min(box.bottom, ctx.pageSize.height),
  };
  const extend = b => {
    rect.left = Math.max(0, Math.min(rect.left, Math.floor(b.left)));
    rect.top = Math.max(0, Math.min(rect.top, Math.floor(b.top)));
    rect.right = Math.min(ctx.pageSize.width, Math.max(rect.right, Math.ceil(b.right)));
    rect.bottom = Math.min(ctx.pageSize.height, Math.max(rect.bottom, Math.ceil(b.bottom)));
  };
  for (const mb of members) {
    extend(mb.b);
  }

  // Closure: a stroke that does not touch the box itself but overlaps the
  // grown rect within the DESCENDER BAND (from the box top down to one box
  // height below it) is title ink too — deep descenders, t-bars and
  // underlines drawn as separate strokes (field case 2026-07-15: two such
  // strokes aborted the conversion as false colliders). Anything reaching
  // deeper stays a collider: body lines are never absorbed.
  const pool = others.slice();
  if (members.length > 0) {
    for (let pass = 0; pass < 4; pass++) {
      let absorbed = false;
      for (let i = pool.length - 1; i >= 0; i--) {
        const o = pool[i];
        if (
          rectsOverlap(o.b, rect) &&
          o.b.top >= box.top &&
          o.b.bottom <= box.bottom + boxH
        ) {
          members.push(o);
          extend(o.b);
          pool.splice(i, 1);
          absorbed = true;
        }
      }
      if (!absorbed) {
        break;
      }
    }
  }

  if (members.length > 0) {
    if (rect.bottom > box.bottom + 2 * boxH) {
      log(
        `HEADING: grown rect reaches too deep (${JSON.stringify(rect)}) — runaway stroke? Aborting.`,
      );
      toast('SuperTemplate: the title reaches too far down — nothing converted.');
      return null;
    }
    const colliders = pool.filter(o => rectsOverlap(o.b, rect));
    if (colliders.length > 0) {
      log(
        `HEADING: grown title rect ${JSON.stringify(rect)} collides with ${colliders.length} other stroke(s) — aborting. Colliders: ${JSON.stringify(colliders.slice(0, 3))}`,
      );
      toast('SuperTemplate: the title area touches other writing — nothing converted.');
      return null;
    }
    if (unboxed > 0) {
      log(
        `HEADING: ${unboxed} stroke(s) without a bbox — collisions not verifiable for them.`,
      );
    }
  }
  log(
    `HEADING: title rect ${JSON.stringify(rect)} (${members.length} stroke(s) anchored on the box)`,
  );
  if (members.length > 0) {
    log(`members: ${JSON.stringify(members.slice(0, 25))}`);
  }
  return {rect, count: members.length, memberNums: members.map(m => m.num), unboxed};
}

/** Materialize the current lasso selection: stroke nums/bboxes + text boxes. */
async function readSelection(out) {
  const els = await PluginCommAPI.getLassoElements();
  const arr = (els && els.result) || [];
  out.strokeNums = [];
  const bboxes = [];
  const elements = [];
  const boxes = [];
  for (const el of arr) {
    try {
      const m = JSON.parse(JSON.stringify(el));
      if (m.type === 0) {
        if (m.numInPage != null) {
          out.strokeNums.push(m.numInPage);
        }
        bboxes.push(strokeBBox(m));
        elements.push(el);
      } else if (m.type === 500 && m.textBox) {
        boxes.push({num: m.numInPage, tb: m.textBox});
        try {
          if (el && typeof el.recycle === 'function') {
            el.recycle();
          }
        } catch (_) {}
      }
    } catch (_) {}
  }
  log(
    `selection: ${out.strokeNums.length} stroke(s) ${JSON.stringify(out.strokeNums)}, ${boxes.length} text box(es)`,
  );
  return {bboxes, elements, boxes};
}

/** Re-insert rescued text boxes identically (content, frame, style). */
async function reinsertBoxes(boxes) {
  for (const b of boxes) {
    try {
      const tb = b.tb || {};
      const res = await PluginNoteAPI.insertText({
        textContentFull: tb.textContentFull || '',
        textRect: tb.textRect,
        fontSize: tb.fontSize || 40,
        textAlign: tb.textAlign != null ? tb.textAlign : 1,
        textBold: tb.textBold || 0,
        ...(tb.fontPath ? {fontPath: tb.fontPath} : {}),
      });
      log(`rescue re-insert "${(tb.textContentFull || '').slice(0, 30)}" → ${JSON.stringify(res)}`);
    } catch (e) {
      log(`rescue re-insert failed: ${e.message}`);
    }
  }
}

/**
 * No ink in the box: convert a typed title text box (e.g. left by a
 * previous OCR run) into the native heading. Date-stamp-like boxes are
 * never converted; if one shares the selection with the title, abort
 * rather than risk converting it (log + toast, next trigger after the
 * user moves it works).
 */
async function headTypedTitle(ctx, out, selection) {
  const off = ctx.displayOff || {x: 0, y: 0};
  const boxShifted = {
    left: ctx.titleBoxPage.left + off.x,
    top: ctx.titleBoxPage.top + off.y,
    right: ctx.titleBoxPage.right + off.x,
    bottom: ctx.titleBoxPage.bottom + off.y,
  };
  const isTitle = b => {
    const content = (b.tb && b.tb.textContentFull) || '';
    if (!content.trim() || looksLikeStamp(content)) {
      return false;
    }
    const tr = b.tb && b.tb.textRect;
    return (
      !tr ||
      rectsOverlap(tr, ctx.titleBoxPage) ||
      rectsOverlap(tr, boxShifted)
    );
  };
  const titles = selection.boxes.filter(isTitle);
  if (titles.length === 0) {
    log('HEADING: title box is empty — nothing to convert.');
    toast('SuperTemplate: nothing to convert in the title box.');
    return out;
  }
  if (titles.length < selection.boxes.length) {
    log(
      `HEADING: ${selection.boxes.length - titles.length} non-title box(es) share the selection — typed-title conversion aborted for safety.`,
    );
    toast('SuperTemplate: another text box is in the way — no heading applied.');
    return out;
  }
  const style = ctx.config.headingStyle || 1;
  out.titleTextNum = titles[0].num; // repoint target for the hijack repair
  const titleRes = await PluginNoteAPI.setLassoTitle({style});
  log(
    `setLassoTitle(typed title "${(titles[0].tb.textContentFull || '').slice(0, 30)}", {style:${style}}) → ${JSON.stringify(titleRes)}`,
  );
  out.converted = !!(titleRes && titleRes.success);
  out.lassoConsumed = true;
  if (!out.converted) {
    toast('SuperTemplate: the device refused to heading the typed title.');
  }
  return out;
}

/** True when two rects overlap (touching edges count as overlap). */
function rectsOverlap(a, b) {
  return !(
    b.left > a.right ||
    b.right < a.left ||
    b.top > a.bottom ||
    b.bottom < a.top
  );
}

/** Extract a stroke bounding box from a materialized element (multi-path). */
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

/** Hide the lasso overlay while we work (state 3 keeps the lasso alive). */
async function hideLassoUi() {
  try {
    const res = await PluginCommAPI.setLassoBoxState(3);
    log(`setLassoBoxState(3) hide UI → ${JSON.stringify(res)}`);
  } catch (e) {
    log(`setLassoBoxState(3) failed (non-fatal): ${e.message}`);
  }
}
