# Migrating a Supernote plugin to the plugin-preview (Chauvet) firmware

Field notes from porting **SuperTemplate** to the plugin-preview firmware
(Chauvet `3.29.43` Manta/Nomad, `2.26.40` A5X/A6X, released 2026-08-24). Verified
on a Manta on the preview build. Treat the **official docs** and the
**upgraded `sn-plugin-lib`** as the source of truth; this page is the practical
distilled version.

## Sources of truth (check these, don't guess)

- Official docs: <https://docs.supernote.com/en> — every page is fetchable as
  `.md` (index: <https://docs.supernote.com/llms.txt>). Key pages:
  - Permissions: <https://docs.supernote.com/en/plugin-base/permission.md>
  - `requestPermission` / `hasPermission` under
    `…/api-reference/supernote-plugin/plugin-manager/`
  - `registerPluginLifeListener`: `…/plugin-manager/register-plugin-life-listener.md`
- The lib on npm: `npm view sn-plugin-lib version` → **0.1.65** (published
  2026-08-24). After `npm/yarn upgrade sn-plugin-lib --latest`, read
  `node_modules/sn-plugin-lib/src/` for the **real** signatures/enums — the
  JSDoc is sometimes incomplete (see FILE:READ below).
- A working reference: this repo (SuperTemplate v2.0.5) is a fully migrated,
  device-validated plugin — its `PluginConfig.json`, `index.js`,
  `src/utils/permissions.js` and `src/runHeaderActions.js` show the patterns.

## Compatibility (breaking, both directions)

- A plugin built on lib **0.1.65 does NOT run on the old firmware**, and an old
  build does not run on the preview. There is no single binary for both unless
  you feature-detect at runtime.
- So ship **two releases**: one for the stable firmware, one for the preview.
  Installing the wrong one shows *"package not compatible"* or the plugin does
  nothing. Keep the preview build clearly labelled.

## 1. Mandatory: upgrade the lib + rebuild

`npm/yarn upgrade sn-plugin-lib --latest`, then rebuild the `.snplg`. Nothing
runs on the new firmware without this. RN stays pinned to **0.79.2** — never
change it.

## 2. Permissions (the big new thing)

Declare in `PluginConfig.json`, then request at runtime:

```json
{ "…": "…", "uses-permissions": ["plugin.permission.FILE:READ", "plugin.permission.FILE:WRITE"] }
```

- Strings: `plugin.permission.FILE:READ` / `FILE:WRITE` / `FILE:DELETE` /
  `INTERNET`. Calling `requestPermission` for a permission you did **not**
  declare fails with **code 1500**.
- Flow (call `PluginManager.init()` first):
  `hasPermission(perm)` → `0` not granted / `1` granted;
  `requestPermission(perm, desc?)` → `0` deny / `1` allow once / `2` always.
- ⚠️ **`FILE:READ` is real and enforced even on raw `java.io`/RNFS access** to
  shared storage (`Note`, `Document`, `MyStyle`, `EXPORT`, `INBOX`, `SCREENSHOT`)
  — a read on a non-granted path throws
  `SecurityException: no READ permission on sdcard`. The lib's JSDoc only lists
  WRITE/DELETE/INTERNET, but READ exists. Element read APIs
  (`getElements`/`getElement`/`getLassoElements`) need READ; insert/modify/delete
  need WRITE. Only the plugin's **private** dir
  `/data/.../plugins/<pluginID>` is permission-free.
- Pattern: an `ensureFilePermissions()` helper (see `src/utils/permissions.js`)
  called **at boot before the first file read** (e.g. before a config read), and
  again as a guard before writes. Wrap the calls in try/catch so a legacy host
  (no permission API) degrades to "granted".

## 3. `app.json` name MUST equal `pluginKey` — exactly, case-sensitive

The preview host runs `AppRegistry.runApplication(pluginKey)` strictly. If
`app.json`'s `name` ≠ `PluginConfig.json`'s `pluginKey` (even by case), you get
`Invariant Violation: "<pluginKey>" has not been registered` — the plugin
installs (`enable=true`) but its view never opens / it's absent from the
toolbar. The old firmware tolerated a mismatch. Fix: make them identical.

## 4. New / changed APIs worth using

- `PluginCommAPI.canHandwrite()` → `APIResponse<boolean>`; only run
  handwriting actions where `result === true`.
- `PluginCommAPI.getPageDisplaySize()` → `{width,height}` = the **display/screen**
  size, not the page size. On a note made for another model, `getPageSize` is
  the note's size (e.g. 1404×1872) while `getPageDisplaySize` is the host screen
  (e.g. 1920×2560) — handy to detect a "foreign" page.
- `PluginManager.registerPluginLifeListener({onMsg(msg)})`, `msg.state` 0..5
  (**5 = destroy** = the "onRemove" a lot of plugins wanted). It **replaces the
  removed `addPluginLifeListener`** → any plugin using the old name breaks; migrate.
- Element page indices / `numInPage` are now **1-indexed** (were 0). If a plugin
  reads a page index from `getCurrentPageNum` and passes it to element APIs,
  re-test on device for an off-by-one. `numInPage` stays self-consistent when
  read and written through the same lib.
- The **phantom lasso-paste is fixed** on this firmware: with a loaded lasso
  copy buffer, no ghost strokes appear during a programmatic lasso lifecycle.
  If your plugin re-points a title to a JS-computed cluster to strip ghosts, it
  may now drop **legitimate** strokes — prefer trusting the lasso selection.
- **Disk growth is fixed**: the firmware auto-cleans old-version cache, so a
  native `cleanupOldVersions`/PluginJanitor module is now redundant (harmless).

## 5. Gotchas learned the hard way

- **Be very careful with native changes.** Removing a native module (or a bad
  `gradlew clean`) can leave the plugin installed but with the JS bundle never
  executing (`E note.pluginhos: No implementation found for
  jniGetHermesHeapSizeBytes`, zero JS logs, absent from the toolbar). Always
  device-test a native change; `git checkout` the removed files to recover. A
  quick tell: the `.snplg` size dropping unexpectedly.
- **Debug with chatty off:** `adb logcat -P ""` (the chatty filter hides plugin
  init logs — `mqt_<pluginID> expire N lines`). Force a clean reload with
  `adb shell am force-stop com.ratta.supernote.pluginhost` (only when needed).
  Install success = `PluginInstallManager: installPlugin: success`; a stuck load
  = `PluginApp setIsLoading timer out`.
- Bundle checks are cheap: `grep` the built `build/generated/*.bundle` for your
  boot markers to confirm the JS is in there before chasing a native issue.
