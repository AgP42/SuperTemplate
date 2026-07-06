import {ZONES, zoneToRect} from '../src/zones';
import {
  formatStamp,
  formatKeyword,
  looksLikeStamp,
  KEYWORD_FORMATS,
  SUPPORTED_LANGS,
} from '../src/utils/datetime';
import {createDoubleTapDetector} from '../src/utils/doubleTap';

describe('zoneToRect', () => {
  // A5 X page size
  const pageSize = {width: 1404, height: 1872};

  it('scales the datetime zone to page pixels', () => {
    const r = zoneToRect(ZONES.datetime, pageSize);
    expect(r).toEqual({
      left: Math.round((776 / 1920) * 1404),
      top: Math.round((16 / 2560) * 1872),
      right: Math.round((1317 / 1920) * 1404),
      bottom: Math.round((126 / 2560) * 1872),
    });
    expect(r.right).toBeGreaterThan(r.left);
    expect(r.bottom).toBeGreaterThan(r.top);
  });

  it('keeps the title zone inside the page', () => {
    const r = zoneToRect(ZONES.title, pageSize);
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.right).toBeLessThanOrEqual(pageSize.width);
    expect(r.bottom).toBeLessThanOrEqual(pageSize.height);
  });

  it('zones do not overlap', () => {
    const dt = zoneToRect(ZONES.datetime, pageSize);
    const ti = zoneToRect(ZONES.title, pageSize);
    expect(dt.bottom).toBeLessThanOrEqual(ti.top);
  });
});

describe('datetime formatting', () => {
  const d = new Date(2026, 6, 5, 9, 7); // Sunday 5 July 2026, 09:07

  it('formats fr as DD/MM/YYYY HH:mm', () => {
    expect(formatStamp(d, 'fr')).toBe('05/07/2026 09:07');
  });

  it('formats iso as YYYY-MM-DD HH:mm', () => {
    expect(formatStamp(d, 'iso')).toBe('2026-07-05 09:07');
  });

  it('formats long as French full date', () => {
    expect(formatStamp(d, 'long')).toBe('dimanche 5 juillet 2026');
  });

  it('formats day as abbreviated weekday + date + time', () => {
    expect(formatStamp(d, 'day')).toBe('dim. 05/07/2026 09:07');
  });

  it('defaults to fr for unknown format keys', () => {
    expect(formatStamp(d, 'nope')).toBe('05/07/2026 09:07');
  });

  it('formats the search keyword as YYYYMMDD', () => {
    expect(formatKeyword(d)).toBe('20260705');
  });

  it('supports every keyword format', () => {
    expect(formatKeyword(d, 'YYYY-MM-DD')).toBe('2026-07-05');
    expect(formatKeyword(d, 'DD/MM/YYYY')).toBe('05/07/2026');
    expect(formatKeyword(d, 'YYYY-MM')).toBe('2026-07');
    expect(KEYWORD_FORMATS).toContain('YYYYMMDD');
  });

  it('uses each country\'s own conventions, not translated French', () => {
    // en (US): M/D/YYYY, 12-hour clock, "Sunday, July 5, 2026"
    expect(formatStamp(d, 'fr', 'en')).toBe('7/5/2026 9:07 AM');
    expect(formatStamp(d, 'long', 'en')).toBe('Sunday, July 5, 2026');
    expect(formatStamp(d, 'day', 'en')).toBe('Sun, 7/5/2026 9:07 AM');
    // de: DD.MM.YYYY, 24h, "Sonntag, 5. Juli 2026"
    expect(formatStamp(d, 'fr', 'de')).toBe('05.07.2026 09:07');
    expect(formatStamp(d, 'long', 'de')).toBe('Sonntag, 5. Juli 2026');
    // es: "domingo, 5 de julio de 2026"
    expect(formatStamp(d, 'long', 'es')).toBe('domingo, 5 de julio de 2026');
    // it: "domenica 5 luglio 2026"
    expect(formatStamp(d, 'long', 'it')).toBe('domenica 5 luglio 2026');
    expect(SUPPORTED_LANGS).toEqual(['fr', 'en', 'de', 'es', 'it']);
  });

  it('detects German and US numeric stamps too', () => {
    expect(looksLikeStamp('05.07.2026 09:07')).toBe(true);
    expect(looksLikeStamp('7/5/2026 9:07 AM')).toBe(true);
  });

  it('detects existing stamps for idempotence', () => {
    expect(looksLikeStamp('05/07/2026 09:07')).toBe(true);
    expect(looksLikeStamp('2026-07-05 09:07')).toBe(true);
    expect(looksLikeStamp('dimanche 5 juillet 2026')).toBe(true);
    expect(looksLikeStamp('Sunday 5 July 2026')).toBe(true);
    expect(looksLikeStamp('my meeting notes')).toBe(false);
    expect(looksLikeStamp(null)).toBe(false);
  });
});

describe('double-tap detector', () => {
  const rect = {left: 100, top: 100, right: 500, bottom: 300};
  const inside = (x, y) =>
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

  it('fires on two taps inside the zone (fast or slow, up to 1600ms)', () => {
    const tap = createDoubleTapDetector({isInside: inside});
    expect(tap(200, 200, 1000)).toBe(false);
    expect(tap(210, 205, 1300)).toBe(true); // fast
    expect(tap(200, 200, 3000)).toBe(false);
    expect(tap(210, 205, 4200)).toBe(true); // slow
  });

  it('does not fire when taps are too far apart in time', () => {
    const tap = createDoubleTapDetector({isInside: inside});
    expect(tap(200, 200, 1000)).toBe(false);
    expect(tap(200, 200, 2800)).toBe(false);
  });

  it('does not fire when taps are too far apart in space', () => {
    const tap = createDoubleTapDetector({isInside: inside});
    expect(tap(150, 150, 1000)).toBe(false);
    expect(tap(450, 280, 1200)).toBe(false);
  });

  it('resets when a tap lands outside the zone', () => {
    const tap = createDoubleTapDetector({isInside: inside});
    expect(tap(200, 200, 1000)).toBe(false);
    expect(tap(50, 50, 1600)).toBe(false); // outside → reset
    expect(tap(200, 200, 2200)).toBe(false); // sequence restarted
    expect(tap(200, 200, 2900)).toBe(true);
  });

  it('a third tap starts a new sequence (no triple-fire)', () => {
    const tap = createDoubleTapDetector({isInside: inside});
    tap(200, 200, 1000);
    expect(tap(200, 200, 1700)).toBe(true);
    expect(tap(200, 200, 2400)).toBe(false);
  });
});
