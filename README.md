# SuperTemplate

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-support%20%E2%98%95-black)](https://ko-fi.com/agp42)

**One double-tap turns your handwritten page title into a real Supernote
heading and stamps the current date & time — on a ready-made note template.**

SuperTemplate is a plugin for Supernote e-ink devices (tested on A5 X and
Manta). It ships six note templates — **lined or dot-grid**, each in black,
light or no logo — with a title box and a datetime slot; write your title on
the guide line, **double-tap the logo area with your finger**, and the plugin:

- stamps the current date & time (4 formats x 5 languages, size options),
- registers an invisible date keyword so the page is findable via
  Supernote's search (format configurable, can be turned off),
- converts your title into a **native heading** (visible in the note's
  table of contents) — your handwriting is taken **whole**, even letters
  sticking out of the box; typed text boxes work too,
- either keeps your handwriting (4 native styles) or replaces it with typed
  text via **on-device OCR** — sizes up to 180 on the Supernote scale, your
  own fonts from `MyStyle/fonts`,
- and lets you **pick the heading style with the pen**: underline or
  double-underline your title to switch styles on the fly (mapping
  configurable).

Always active once installed — no app to open. Re-triggering a finished
page does nothing (real idempotence), and every refusal is explained with a
popup. Everything runs on-device. No cloud, no network, no account.

![Result](docs/images/01-result.png)

New in v2.0: **dot-grid templates** alongside the ruled ones (black, light or no logo):

![A dot-grid template](docs/images/12-dotgrid.png)

## Which version do I need? (Supernote firmware)

In August 2026 Supernote shipped a **plugin-preview firmware** (Chauvet
`3.29.43` for Manta / Nomad, `2.26.40` for A5 X / A6 X) that introduces a new
plugin **permission system** and other breaking plugin-API changes. A build
made for one firmware does **not** run on the other — so download the release
that matches your device:

| Your firmware | Download | Notes |
|---|---|---|
| **Stable / older** — you never flashed the developer plugin-preview build | **[v1.0.0](../../releases/tag/v1.0.0)** | The classic build. This is what almost everyone should use. |
| **Plugin-preview (Chauvet)** — you flashed the developer plugin-preview firmware | **[v2.0.5](../../releases/tag/v2.0.5)** | Rebuilt for `sn-plugin-lib` 0.1.65: declares & requests the file permissions the new firmware requires. Also adds the dot-grid templates. |

**Not sure which you have?** If you never deliberately installed a "plugin
preview / developer" firmware, you are on stable → use **v1.0.0**. Installing
the wrong build shows *"package not compatible"* or the plugin does nothing.

## Install

1. Download the `supertemplate-X.Y.Z.snplg` that matches your firmware
   (see [Which version do I need?](#which-version-do-i-need-supernote-firmware)
   above) and copy it into the `MyStyle` folder of your device (USB file
   transfer or Supernote Partner).
2. On the device: **Settings → Apps → Plugins → Add Plugin** → select
   `supertemplate`.
3. Open a note, open the toolbar plugin menu, tap **SuperTemplate** and use
   **Install / update templates** — the six bundled template pages (lined and
   dot-grid) land in MyStyle.
4. Create a note page with one of the `SuperTemplate_simpleNote` (lined) or
   `SuperTemplate_dotGrid` (dotted) templates and enjoy.

Full instructions, settings reference and troubleshooting:
[User Manual](docs/USER_MANUAL.md).

## Screen flashing — fixed on the plugin-preview firmware (since v2.0.5)

The two firmware bugs this plugin used to work around are **fixed by Ratta on
the plugin-preview (Chauvet) firmware**, so **v2.0.5** runs noticeably cleaner:

- The **phantom lasso-paste** — the note app spontaneously pasting its lasso
  copy buffer during a plugin lasso operation, which added ghost strokes and
  extra flashing — no longer happens. Title conversion keeps your whole title
  with no leftover ghosts.
  ([originally reported and confirmed by Ratta](https://www.reddit.com/r/Supernote_dev/comments/1uodbvo/))
- **Old plugin versions stacking on disk** is now auto-cleaned by the firmware.
  ([reported here](https://www.reddit.com/r/Supernote_dev/comments/1uo2y0g/))

On the **stable firmware** (v1.0.0) both bugs are still present: the page
flashes a few times while the plugin strips ghost content on the fly, and it
cleans its own stale versions at startup. Those safety guards remain in v2.0.5
as a dormant net.

## Building from source

```bash
npm ci
./buildPlugin.sh   # run TWICE on a fresh clone (autolinking is generated
./buildPlugin.sh   # by the first gradle pass) → build/outputs/*.snplg
```

Requires Node >= 18, JDK >= 19, Android SDK Platform 35. React Native is
pinned to 0.79.2 (must match the device's PluginHost runtime — never
upgrade).

The `main` branch targets the **plugin-preview (Chauvet) firmware**
(`sn-plugin-lib` 0.1.65, file-permission handling). To build the
**stable-firmware** version instead, check out the `v1.0.0` tag first.

Porting your own plugin to the preview firmware? Field notes here:
[docs/CHAUVET-MIGRATION.md](docs/CHAUVET-MIGRATION.md).

Advanced: zones are stored as page-size ratios in the on-device config
(`MyStyle/Plugins/SuperTemplate/SuperTemplate_Config.json`) — edit them to
adapt the plugin to your own template PNG.

## Credits

- [gorlix/SuperFlow](https://github.com/gorlix/SuperFlow) — zone/action
  architecture inspiration and the on-device log-file debugging technique.
- [taoist22/sn-datetime](https://github.com/taoist22/sn-datetime) — datetime
  stamp concept and the searchable date-keyword trick.
- [Laumss/Inkling](https://github.com/Laumss/Inkling) (MIT) — the floating
  bubble native module adapted from its code (currently dormant) and the
  Supernote plugin development knowledge base.

## Support

If you enjoy this plugin, please consider [sponsoring a few tokens](https://ko-fi.com/agp42) ;-)
My time and skills are free — the AI tokens behind this plugin are not!
Thank you for your support ☕

## License

[MIT](LICENSE)
