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
async function removeParasiteStrokes(ctx, numsBefore, strokesBefore, extraNums) {
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
    for (const n of candidates) {
      try {
        const elRes = await PluginFileAPI.getElement(ctx.path, ctx.pageNum, n);
        const el = elRes && elRes.result;
        let type = el && el.type;
        try {
          type = JSON.parse(JSON.stringify(el)).type;
        } catch (_) {}
        log(`paste-guard: new element num=${n} type=${type}`);
        if (type === 0) {
          parasites.push(n);
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
    // APPEARED during the pipeline. On inconsistency, ghosts are kept
    // (never guess) — the feature deletion (extras) still proceeds.
    let ghosts = parasites;
    const strokesAfter = (after.byType && after.byType[0]) || 0;
    const delta = strokesAfter - strokesBefore;
    if (ghosts.length > Math.max(0, delta)) {
      log(
        `paste-guard: ABORT ghosts — ${ghosts.length} candidate(s) but stroke delta is ${delta}; keeping them.`,
      );
      ghosts = [];
    }
    const deleteList = [...extras, ...ghosts];
    if (deleteList.length === 0) {
      log('paste-guard: nothing to delete.');
      return;
    }
    log(
      `cleanup: deleting ${extras.length} handwriting + ${ghosts.length} ghost stroke(s) (nums ${JSON.stringify(deleteList)})`,
    );
    const delRes = await PluginFileAPI.deleteElements(
      ctx.path,
      ctx.pageNum,
      deleteList,
    );
    log(`deleteElements → ${JSON.stringify(delRes)}`);
    const reload = await PluginCommAPI.reloadFile();
    log(`reloadFile → ${JSON.stringify(reload)}`);
  } catch (e) {
    log(`paste-guard failed: ${e.message}`);
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
    // LASSO rules (probe-proven 2026-07-12): PAGE coordinates, FULL
    // containment of strokes, and the rect is rejected outright if it
    // exceeds the page bounds. So the lasso rect is page-based, extended
    // downward (handwriting descends below the box — 4/6 strokes were
    // missed for that) but stopped above the first ruled line, and clamped
    // to the page. INSERT rules: DISPLAY coordinates (page + offset).
    const boxH = titlePage.bottom - titlePage.top;
    const titleLasso = {
      left: Math.max(0, titlePage.left),
      top: titlePage.top + Math.round(boxH * 0.15),
      right: Math.min(ctx.pageSize.width, titlePage.right),
      bottom: Math.min(
        titlePage.bottom + Math.round(boxH * 0.45),
        Math.round(ctx.pageSize.height * 0.152), // above the first ruled line
        ctx.pageSize.height,
      ),
    };
    const titleRect = shift(titlePage); // display basis, for text inserts
    const datetimeRect = shift(datetimePage);
    log(
      `coords: page=${ctx.pageSize.width}x${ctx.pageSize.height} screen=${Math.round(screen.width)}x${Math.round(screen.height)} offset=(${off.x},${off.y})`,
    );
    log(
      `zones: titleLasso=${JSON.stringify(titleLasso)} titleInsert=${JSON.stringify(titleRect)} datetime=${JSON.stringify(datetimeRect)}`,
    );

    const heading = await runHeadingAction(ctx, {
      lasso: titleLasso,
      insert: titleRect,
    });
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
