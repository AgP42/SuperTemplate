import {PluginCommAPI, PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {zoneToRect} from './zones';
import {screenPx} from './utils/screen';
import {toast} from './utils/toast';
import {loadConfig, getActiveZones} from './config';
import {runHeadingAction} from './actions/HeadingAction';
import {runDateTimeAction} from './actions/DateTimeAction';
import {log, flushLog} from './utils/logger';

/**
 * Page snapshot: element counts by type (elements recycled after reading —
 * native-side cache, skill gotcha #4). Accessor uuids are NOT usable as
 * element identity: they are regenerated on every read (the v3 uuid guard
 * classified the whole page as ghosts and wiped it — never again).
 */
async function pageSnapshot(ctx, label) {
  const res = await PluginFileAPI.getElements(ctx.pageNum, ctx.path);
  const els = (res && Array.isArray(res.result) && res.result) || [];
  if (els.length === 0) {
    log(
      `getElements raw (empty) → ${JSON.stringify(res).slice(0, 200)}`,
    );
  }
  const byType = {};
  for (const el of els) {
    let t = el.type;
    try {
      t = JSON.parse(JSON.stringify(el)).type;
    } catch (_) {}
    byType[t] = (byType[t] || 0) + 1;
    try {
      if (el && typeof el.recycle === 'function') {
        el.recycle();
      }
    } catch (_) {}
  }
  log(`census ${label}: total=${els.length} byType=${JSON.stringify(byType)}`);
  return {byType, total: els.length};
}

/** Element numbers currently on the page (this lib: (notePath, page)). */
async function elementNums(ctx, label) {
  const res = await PluginFileAPI.getElementNumList(ctx.path, ctx.pageNum);
  log(`getElementNumList ${label} → ${JSON.stringify(res).slice(0, 300)}`);
  return (res && Array.isArray(res.result) && res.result) || [];
}

/**
 * PASTE-GUARD v2 (SAFE failure mode). The firmware ghost-pastes the lasso
 * copy buffer during our programmatic lasso lifecycle (confirmed by
 * Ratta, fix pending). Identity = numInPage diff: it can MISS ghosts when
 * our own deletions shift the numbering (OCR mode), but it can never
 * classify a pre-existing stroke as a ghost. Extra hard cap: never delete
 * more strokes than the measured stroke-count delta — any inconsistency
 * aborts with a log instead of deleting.
 */
async function removeParasiteStrokes(ctx, numsBefore, strokesBefore, extraNums, selfDeleted, heading) {
  try {
    const after = await pageSnapshot(ctx, 'END');
    const numsAfter = await elementNums(ctx, 'END');
    const before = new Set(numsBefore);
    const candidates = numsAfter.filter(n => !before.has(n));
    // Handwriting strokes the OCR step replaced: deleted here in the same
    // single pass (they are a feature deletion, not guard candidates).
    const extras = (extraNums || []).filter(n => numsAfter.includes(n));
    if (candidates.length === 0 && extras.length === 0) {
      log('paste-guard: no new elements — nothing to clean.');
      return;
    }
    const parasites = [];
    const newTitleNums = [];
    let newTitleTextNum = null; // fresh text box sitting in the title box
    for (const n of candidates) {
      try {
        const elRes = await PluginFileAPI.getElement(ctx.path, ctx.pageNum, n);
        const el = elRes && elRes.result;
        let m = null;
        try {
          m = JSON.parse(JSON.stringify(el));
        } catch (_) {}
        const type = m ? m.type : el && el.type;
        log(`paste-guard: new element num=${n} type=${type}`);
        if (type === 0) {
          parasites.push(n);
        } else if (type === 100) {
          newTitleNums.push(n);
        } else if (
          type === 500 &&
          newTitleTextNum == null &&
          m &&
          m.textBox &&
          m.textBox.textRect &&
          ctx.titleBoxPage &&
          rectsTouch(m.textBox.textRect, ctx.titleBoxPage, ctx.displayOff)
        ) {
          newTitleTextNum = n; // the OCR-inserted heading text
        }
        try {
          if (el && typeof el.recycle === 'function') {
            el.recycle();
          }
        } catch (_) {}
      } catch (e) {
        log(`paste-guard: getElement(${n}) failed: ${e.message}`);
      }
    }
    // Hard safety cap: ghost candidates may not exceed the strokes that
    // APPEARED during the pipeline — counting the ones WE deleted midway
    // (OCR replaces ink before this pass runs), or real ghosts sneak
    // under the cap. On inconsistency, ghosts are kept (never guess) —
    // the feature deletion (extras) still proceeds.
    let ghosts = parasites;
    let strokesAfter = (after.byType && after.byType[0]) || 0;
    if (strokesAfter === 0 && Array.isArray(ctx.pageScan)) {
      // Bulk getElements is broken on this page (see the fallback scan);
      // the per-num type checks above are the ground truth here.
      strokesAfter = strokesBefore + parasites.length;
    }
    const delta = strokesAfter - strokesBefore + (selfDeleted || 0);
    if (ghosts.length > Math.max(0, delta)) {
      log(
        `paste-guard: ABORT ghosts — ${ghosts.length} candidate(s) but stroke delta is ${delta}; keeping them.`,
      );
      ghosts = [];
    }
    // ── THE END CONTRACT ─────────────────────────────────────────────────
    // Whatever happened during the pipeline (buffer hijack, stale
    // coordinates, lasso oddities), the created heading must contain
    // EXACTLY what the user meant: the intended strokes (handwritten
    // mode) or the title text box (OCR / typed mode). Every new title is
    // verified; a wrong one is repointed (modifyElements, file-level) or,
    // failing that, deleted — never a monster heading, never an empty
    // recap entry.
    const deleteList = [...extras, ...ghosts];
    let repaired = 0;
    let cancelled = 0;
    if (heading) {
      for (const tn of newTitleNums) {
        const verdict = await verifyTitleContract(
          ctx,
          tn,
          heading,
          newTitleTextNum,
        );
        if (verdict === 'repaired') {
          repaired++;
        } else if (verdict === 'delete') {
          deleteList.push(tn);
          cancelled++;
        }
      }
      if (cancelled > 0) {
        heading.converted = false;
        toast(
          'SuperTemplate: the conversion went wrong (firmware) — the page was cleaned, no heading applied. Trigger again.',
        );
      }
    }
    if (deleteList.length === 0) {
      log('paste-guard: nothing to delete.');
      if (repaired > 0) {
        const reload = await PluginCommAPI.reloadFile();
        log(`contract-repair reloadFile → ${JSON.stringify(reload)}`);
      }
      return;
    }
    log(
      `cleanup: deleting ${extras.length} handwriting + ${ghosts.length} ghost stroke(s) + ${cancelled} title(s) (nums ${JSON.stringify(deleteList)})`,
    );
    const delRes = await PluginFileAPI.deleteElements(
      ctx.path,
      ctx.pageNum,
      deleteList,
    );
    log(`deleteElements → ${JSON.stringify(delRes)}`);
    const reload = await PluginCommAPI.reloadFile();
    log(`reloadFile → ${JSON.stringify(reload)}`);
    if (newTitleNums.length > 0) {
      try {
        const tRes = await PluginFileAPI.getTitles(ctx.path, [ctx.pageNum]);
        const count =
          (tRes && Array.isArray(tRes.result) && tRes.result.length) || 0;
        log(`post-cleanup getTitles → ${count} title(s) on page.`);
      } catch (e) {
        log(`post-cleanup getTitles failed: ${e.message}`);
      }
    }
  } catch (e) {
    log(`paste-guard failed: ${e.message}`);
  }
}

/**
 * Materialize every listed element via per-num getElement (plain JSON
 * clones, natives recycled). Fallback for pages where bulk getElements
 * returns empty.
 */
async function scanByNums(ctx, nums) {
  const out = [];
  for (const n of nums) {
    try {
      const elRes = await PluginFileAPI.getElement(ctx.path, ctx.pageNum, n);
      const el = elRes && elRes.result;
      if (el) {
        try {
          const m = JSON.parse(JSON.stringify(el));
          if (m && m.type != null) {
            if (m.numInPage == null) {
              m.numInPage = n;
            }
            out.push(m);
          }
        } catch (_) {}
        try {
          if (typeof el.recycle === 'function') {
            el.recycle();
          }
        } catch (_) {}
      }
    } catch (_) {}
  }
  return out;
}

/** Overlap test tolerant to the display offset of foreign pages. */
function rectsTouch(a, b, off) {
  const o = off || {x: 0, y: 0};
  const hit = (r, s) =>
    !(
      s.left > r.right ||
      s.right < r.left ||
      s.top > r.bottom ||
      s.bottom < r.top
    );
  return (
    hit(a, b) ||
    hit(a, {
      left: b.left + o.x,
      top: b.top + o.y,
      right: b.right + o.x,
      bottom: b.bottom + o.y,
    })
  );
}

/** Set equality over element-num arrays. */
function sameNums(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  const s = new Set(a);
  return b.every(n => s.has(n));
}

/**
 * THE END CONTRACT, per created title: its members must be exactly the
 * intended ones — the user's title strokes (handwritten mode) or the
 * title text box (OCR / typed mode). Anything else (buffer hijack, stale
 * page coordinates, lasso oddities — the cause does not matter) gets the
 * title REPOINTED at file level; if the firmware refuses, the title is
 * handed back for deletion.
 * @returns {Promise<'healthy'|'repaired'|'delete'>}
 */
async function verifyTitleContract(ctx, titleNum, heading, newTitleTextNum) {
  let el = null;
  try {
    // What the heading SHOULD contain.
    let expected =
      Array.isArray(heading.intendedNums) && heading.intendedNums.length > 0
        ? heading.intendedNums
        : null;
    let expectText = false;
    if (!expected && heading.titleTextNum != null) {
      expected = [heading.titleTextNum];
      expectText = true;
    }
    if (!expected && newTitleTextNum != null) {
      expected = [newTitleTextNum];
      expectText = true;
    }

    const elRes = await PluginFileAPI.getElement(ctx.path, ctx.pageNum, titleNum);
    el = elRes && elRes.result;
    if (!el) {
      log(`contract: getElement(${titleNum}) returned nothing.`);
      return 'healthy';
    }
    let m = null;
    try {
      m = JSON.parse(JSON.stringify(el));
    } catch (_) {}
    const ctn =
      (m && m.title && Array.isArray(m.title.controlTrailNums)
        ? m.title.controlTrailNums
        : []) || [];
    log(
      `contract: title ${titleNum} members ${JSON.stringify(ctn.slice(0, 30))}, expected ${expected ? JSON.stringify(expected.slice(0, 30)) : 'unknown'}.`,
    );

    if (!expected) {
      log('contract: no intent recorded — leaving the title alone.');
      return 'healthy';
    }
    if (sameNums(ctn, expected)) {
      log('contract: fulfilled.');
      return 'healthy';
    }
    if (expectText && ctn.length === 0) {
      // Text titles may legitimately carry no controlTrailNums — the
      // firmware shape for them is still unconfirmed. Observe, don't touch.
      log('contract: text title with no members — assumed healthy (telemetry).');
      return 'healthy';
    }

    // Contract violation → repoint to the intent.
    const rect = heading.fittedRect;
    try {
      el.title.controlTrailNums = expected;
      if (rect) {
        el.title.X = rect.left;
        el.title.Y = rect.top;
        el.title.width = rect.right - rect.left;
        el.title.height = rect.bottom - rect.top;
      }
    } catch (_) {}
    const res = await PluginFileAPI.modifyElements(ctx.path, ctx.pageNum, [el]);
    log(
      `contract: REPOINTED title ${titleNum} (${ctn.length} → ${expected.length} member(s)) → ${JSON.stringify(res)}`,
    );
    if (res && res.success === true) {
      return 'repaired';
    }
    log('contract: repoint refused — the title will be deleted.');
    return 'delete';
  } catch (e) {
    log(`contract verification failed: ${e.message}`);
    return 'healthy';
  } finally {
    try {
      if (el && typeof el.recycle === 'function') {
        el.recycle();
      }
    } catch (_) {}
  }
}

/**
 * Full one-tap pipeline, executed on the currently displayed NOTE page:
 *   1. resolve context (file, page, page size)
 *   2. save the note (required before file-level reads)
 *   3. HEADING action on the title zone (+ OCR probe)
 *   4. DATETIME action on the datetime zone
 * Every SDK response is logged to MyStyle/Plugins/SuperTemplate_Log.txt.
 */
export async function runHeaderActions() {
  try {
    const pathRes = await PluginCommAPI.getCurrentFilePath();
    const pageRes = await PluginCommAPI.getCurrentPageNum();
    log(
      `context: path=${JSON.stringify(pathRes)} page=${JSON.stringify(
        pageRes,
      )}`,
    );
    if (!pathRes || pathRes.success !== true || !pathRes.result) {
      log('ABORT: no active file (is a note open?).');
      return;
    }
    if (!String(pathRes.result).endsWith('.note')) {
      log('ABORT: active file is not a .note — actions are NOTE-only.');
      return;
    }

    const ctx = {path: pathRes.result, pageNum: pageRes.result || 0};

    try {
      const saveRes = await PluginNoteAPI.saveCurrentNote();
      log(`saveCurrentNote → ${JSON.stringify(saveRes)}`);
    } catch (e) {
      log(`saveCurrentNote failed (continuing): ${e.message}`);
    }

    const sizeRes = await PluginFileAPI.getPageSize(ctx.path, ctx.pageNum);
    log(`getPageSize → ${JSON.stringify(sizeRes)}`);
    if (!sizeRes || sizeRes.success !== true || !sizeRes.result) {
      log('ABORT: cannot resolve page size.');
      return;
    }
    ctx.pageSize = sizeRes.result;
    ctx.config = await loadConfig();
    const zones = getActiveZones(ctx.config);
    log(
      `config: template=${ctx.config.activeTemplate} format=${ctx.config.dateFormat} size=${ctx.config.fontSize} keyword=${ctx.config.keyword} headingStyle=${ctx.config.headingStyle}`,
    );

    let strokesBefore = 0;
    let numsBefore = [];
    try {
      const snapBefore = await pageSnapshot(ctx, 'START');
      strokesBefore = (snapBefore.byType && snapBefore.byType[0]) || 0;
      numsBefore = await elementNums(ctx, 'START');
    } catch (e) {
      log(`pageSnapshot START failed: ${e.message}`);
    }
    ctx.numsAtStart = numsBefore; // paste-intercept baseline (HeadingAction)

    // Some pages return EMPTY from bulk getElements while per-num
    // getElement works fine (field case 2026-07-15, PM workshops p85,
    // ~150 elements): without this fallback the title scan sees no
    // strokes (fragmented mini-title) and the date guard sees no texts
    // (stamps stack). Rebuild the scan element by element and share it.
    if (strokesBefore === 0 && numsBefore.length > 0) {
      log(
        `getElements EMPTY with ${numsBefore.length} element(s) listed — per-element fallback scan.`,
      );
      ctx.pageScan = await scanByNums(ctx, numsBefore);
      strokesBefore = ctx.pageScan.filter(m => m.type === 0).length;
      log(
        `fallback scan: ${ctx.pageScan.length} element(s) materialized, ${strokesBefore} stroke(s).`,
      );
    }

    // DISPLAY MODEL (proven by field data, 2026-07-11): pages created for a
    // SMALLER screen are displayed 1:1, horizontally centered and top-
    // anchored — and the lasso/insert APIs work in DISPLAY coordinates =
    // page coordinates + ((screenW - pageW) / 2, 0). Larger-than-screen
    // pages remain unsupported (refused with a toast).
    const screen = screenPx();
    const smaller =
      screen.width - ctx.pageSize.width > 2 ||
      screen.height - ctx.pageSize.height > 2;
    const larger =
      ctx.pageSize.width - screen.width > 2 ||
      ctx.pageSize.height - screen.height > 2;
    if (larger) {
      log(
        `ABORT: page ${ctx.pageSize.width}x${ctx.pageSize.height} larger than screen ${Math.round(screen.width)}x${Math.round(screen.height)} — unsupported display mode.`,
      );
      toast(
        'SuperTemplate: this page was created for a larger device — not supported on this screen yet.',
      );
      return;
    }
    const off = smaller
      ? {x: Math.round((screen.width - ctx.pageSize.width) / 2), y: 0}
      : {x: 0, y: 0};
    const shift = r => ({
      left: r.left + off.x,
      top: r.top + off.y,
      right: r.right + off.x,
      bottom: r.bottom + off.y,
    });
    const titlePage = zoneToRect(zones.title, ctx.pageSize);
    const datetimePage = zoneToRect(zones.datetime, ctx.pageSize);
    // Inserts use DISPLAY coordinates (page + centering offset on foreign
    // pages); the title selection is fitted to the ink anchored on the box
    // (see HeadingAction).
    const datetimeRect = shift(datetimePage);
    ctx.displayOff = off;
    ctx.titleBoxPage = titlePage;
    const heading = await runHeadingAction(ctx);
    log(`HEADING result: ${JSON.stringify(heading)}`);

    // Idempotence must also see stamps stored in un-shifted page coords
    // (elements inserted before the offset model, or by other tools).
    const datetime = await runDateTimeAction(ctx, datetimeRect, [
      datetimeRect,
      datetimePage,
    ]);
    log(`DATETIME result: ${JSON.stringify(datetime)}`);

    try {
      await PluginNoteAPI.saveCurrentNote();
    } catch (_) {}
    await removeParasiteStrokes(
      ctx,
      numsBefore,
      strokesBefore,
      heading.deleteHandwriting ? heading.strokeNums : [],
      heading.selfDeleted || 0,
      heading,
    );

    log(
      `DONE. heading=${heading.converted ? 'OK' : 'no'} ocr=${
        heading.ocrText !== null ? `"${heading.ocrText}"` : 'n/a'
      } datetime=${datetime.inserted ? 'OK' : 'no'}`,
    );
  } catch (e) {
    log(`FATAL: ${e.message}\n${e.stack}`);
  } finally {
    await flushLog('TRIGGER');
  }
}
