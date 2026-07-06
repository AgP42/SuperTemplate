# SuperTemplate

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-support%20%E2%98%95-black)](https://ko-fi.com/agp42)

**One double-tap turns your handwritten page title into a real Supernote
heading and stamps the current date & time — on a ready-made note template.**

SuperTemplate is a plugin for Supernote e-ink devices (tested on A5 X and
Manta). It ships a note template with a title box and a datetime slot; write
your title, **double-tap the S logo with your finger**, and the plugin:

- stamps the current date & time (4 formats x 5 languages, size options),
- registers an invisible date keyword so the page is findable via
  Supernote's search (format configurable, can be turned off),
- converts your handwritten title into a **native heading** (visible in the
  note's table of contents) — either keeping your handwriting (4 native
  styles) or replacing it with typed text via **on-device OCR** (font and
  size configurable).

Everything runs on-device. No cloud, no network, no account.

![Result](docs/images/01-result.png)

## Install

1. Download `supertemplate-X.Y.Z.snplg` from the
   [latest release](../../releases/latest) and copy it into the `MyStyle`
   folder of your device (USB file transfer or Supernote Partner).
2. On the device: **Settings → Apps → Plugins → Add Plugin** → select
   `supertemplate`.
3. Open a note, open the toolbar plugin menu, tap **SuperTemplate** and use
   **Install / update template** — the bundled template page lands in
   MyStyle.
4. Create a note page with the `SuperTemplate_simpleNote` template and
   enjoy.

Full instructions, settings reference and troubleshooting:
[User Manual](docs/USER_MANUAL.md).

## Known issue: screen flashing (Supernote firmware bug)

While the plugin runs, the page flashes several times and old lasso-copied
content may briefly reappear. This is a **firmware bug** — the note app
spontaneously pastes its lasso copy buffer during any plugin lasso
operation — [reported here and confirmed by Ratta](https://www.reddit.com/r/Supernote_dev/comments/1uodbvo/),
a fix is in the works. SuperTemplate detects and removes the ghost content
automatically; the extra flashing is that cleanup at work.

The plugin also works around a second firmware bug it reported:
[PluginHost never deletes old plugin versions](https://www.reddit.com/r/Supernote_dev/comments/1uo2y0g/)
— it cleans its own stale versions at startup.

## Building from source

```bash
npm ci
./buildPlugin.sh   # run TWICE on a fresh clone (autolinking is generated
./buildPlugin.sh   # by the first gradle pass) → build/outputs/*.snplg
```

Requires Node >= 18, JDK >= 19, Android SDK Platform 35. React Native is
pinned to 0.79.2 (must match the device's PluginHost runtime — never
upgrade).

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

If this is useful to you, you can support it on [Ko‑fi](https://ko-fi.com/agp42) ☕ — thank you!

## License

[MIT](LICENSE)
