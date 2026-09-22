# Third-Party Notices

SmartTodo V1.3.1 bundles the following third-party runtime assets so the interface remains fully local and does not depend on a network connection.

## GSAP 3.15.0

- Project: https://gsap.com/
- Source: https://github.com/greensock/GSAP
- License: GSAP Standard “no charge” license — https://gsap.com/standard-license/
- Bundled runtime: `renderer/vendor/gsap.min.js`
- License notice: retained in this file and in the bundled runtime header.

## Noto Serif SC via Fontsource 5.3.0

- Project: https://fontsource.org/fonts/noto-serif-sc
- Source: https://github.com/fontsource/font-files
- License: SIL Open Font License 1.1
- Bundled font: `assets/fonts/NotoSerifSC-SemiBold.woff2`
- Included license file: `assets/fonts/OFL.txt`

The development-only asset tools `sharp` 0.35.4 and `png-to-ico` 3.0.2 are recorded in `package-lock.json`; they are used to generate local application icon files and are not loaded by the renderer.
