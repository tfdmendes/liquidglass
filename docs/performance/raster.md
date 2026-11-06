# First raster optimization pass

This retained report describes the first pass, now bundled as `previous` in
the comparison website. The current engine has since gained straight-edge
span fills; see [the second pass and FPS report](fps.md).

Measured on 6 November 2026 against our previous integrated fork at
`862e553fae1b97968af4206add31539534764919`. This comparison includes the fork's
existing caches and rendering optimizations in both versions.

That pass reserves `Math.hypot` for rounded corners, computes row
geometry once per row, and fills neutral interior spans with packed pixels.
It retains the existing optical formulas, map resolution and public API.
The bundled skill uses the same updated engine.

## Measured results

Median elapsed milliseconds per operation, lower is better:

| Workload | Previous | New | Time reduction |
| --- | ---: | ---: | ---: |
| Button map, 120 × 64 CSS px | 0.657 ms | 0.513 ms | 21.8% |
| Panel map, 640 × 360 CSS px | 11.479 ms | 7.421 ms | 35.4% |
| Capsule map, 240 × 64 CSS px | 1.112 ms | 0.663 ms | 40.4% |
| Unique lens update, 181.25 × 53.75 CSS px | 1.905 ms | 1.710 ms | 10.2% |

Seven paired samples per workload used the installed Brave browser, reporting
Chromium `157.0.8103.39`, on macOS. Each pair used a fresh page with a 1280 × 900
viewport and DPR 2. Maps used scale 2, radius 32, default bezel and highlight;
the update workload used radius 17.125. Curvature and light angle changed on
each operation. Each sample replayed 120 button maps, 24 panel maps, 100 capsule
maps or 120 updates after an equal-size warmup. Measurement order alternated.

| Workload | Previous sample range | New sample range |
| --- | ---: | ---: |
| Button map | 0.596–0.696 ms | 0.438–0.610 ms |
| Panel map | 11.113–14.258 ms | 7.337–9.733 ms |
| Capsule map | 1.050–1.129 ms | 0.643–0.693 ms |
| Unique lens update | 1.857–2.164 ms | 1.661–1.887 ms |

Map timing includes ImageData allocation, optical calculations, canvas creation
and `putImageData`. Update timing starts after `createGlass` setup and initial
decode. It includes synchronous updates, cache lookup, map generation, PNG
encoding and SVG attribute writes. Replacement decoding and browser paint run
asynchronously and are excluded. These are elapsed browser timings, not process
CPU time, GPU time, FPS, energy use or an end-to-end frame budget.

The button and update sample ranges overlap. Seven samples on a shared host do
not establish statistical significance or a fixed gain on every page. Cached
maps already avoid generation and will not receive the same benefit. No fresh
Firefox, physical-phone or live-site performance measurement was made.

## Correctness and reproduction

The same runner compared **640 raw ImageData maps, 95,545,228 bytes**, with zero
changed bytes. Cases include seeded geometry and optics, odd and fractional
dimensions, five map scales, inverted lenses and non-finite light angles.
The existing PNG/cache suite also covers large interiors, tall rectangles,
capsules, wide highlights, cache eviction and delayed decoding.

Final-source checks passed all six map/cache cases (including 60 exact PNG
comparisons), 1,486 Chromium core/component assertions, 164 WebGL assertions,
and both native macOS WebKit integration cases. The integration fixtures compare
against upstream and exercise desktop, phone-sized and reduced-motion layouts,
scrolling, decode ordering and teardown. Desktop Chromium captures matched
exactly; phone-sized Chromium captures retained small differences allowed by
the existing repeat-control checks and are not claimed to be pixel-exact.
The native checks use WKWebView on macOS, not a physical iPhone.

[raster-results.json](raster-results.json) retains sample counts, medians,
ranges, source SHA-256 hashes, browser version and raw-map check totals, but
not the individual timed samples.
The runner is [measure-raster.mjs](../../review/measure-raster.mjs).

From the repository root, point `LG_PLAYWRIGHT_MODULE` to an existing Playwright
`index.mjs` and `LG_CHROME_EXECUTABLE` to the desired installed Chromium browser.
No packages or browsers are installed. Build the showcase first with
`node scripts/build-showcase.mjs` to generate the candidate file. The command launches a headless browser
with temporary pages and a temporary profile, compares the fixed previous Git
revision with the selected candidate core, and writes JSON under `/tmp`. It does not
change library files or contact a deployed site. Remove the JSON to discard it.
`LG_RASTER_BASE` optionally selects another baseline Git revision;
`LG_RASTER_OUT` changes the report path, and `LG_BROWSER=firefox` selects an
existing Playwright-compatible Firefox installation.

```sh
# Measure the retained first pass against the recorded previous revision
LG_RASTER_CANDIDATE=showcase/dist/builds/previous/liquid-glass.js node review/measure-raster.mjs
```
