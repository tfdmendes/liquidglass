# Straight-edge optimization and animation FPS

The second optimization pass compares the engine delivered earlier in this chat
with the new core. The generated [comparison website](../../showcase/README.md)
contains source snapshots; its `builds/manifest.json` identifies every module
by SHA-256. `previous` is the first optimization pass,
`current` is rebuilt from `lib/`, and the optional `original` is our earlier
integrated fork at `862e553`. It is not the original gentpan upstream.

The new core fills constant spans along straight top and bottom rims using the
first pixel's already-converted RGBA value. It preserves the existing optical
calculations and resolution. Wide lenses benefit; circular lenses retain the
same pixel path. Both the SVG and WebGL renderers use this map generator.

## Map generation

Seven alternating paired samples, elapsed milliseconds per operation at map
scale 2. These are a fresh comparison against `previous`, independent of the
earlier [first-pass report](raster.md).

| Workload | Previous | Current | Less time |
| --- | ---: | ---: | ---: |
| Button map, 120 × 64 | 0.367 ms | 0.258 ms | 29.5% |
| Panel map, 640 × 360 | 5.762 ms | 2.779 ms | 51.8% |
| Capsule map, 240 × 64 | 0.473 ms | 0.290 ms | 38.7% |
| Synchronous unique-lens update | 1.375 ms | 1.206 ms | 12.3% |

[raster-spans-results.json](raster-spans-results.json) retains sample counts,
medians, ranges, correctness results and source hashes. Map timing includes
pixel generation, allocation, canvas creation and upload. Update timing additionally includes cache lookup,
PNG encoding and SVG attribute writes after initial decode. Replacement decode,
paint, GPU completion and energy are excluded. The runner compared 640 raw maps
(95,545,228 bytes) with zero changed bytes.

## Animation FPS

The recorded FPS report uses the installed Brave / Chromium 157 in **headless
mode** on macOS. It measures browser animation cadence through
`requestAnimationFrame`, not frames physically presented by a screen. It must
not be interpreted as a physical display or iPhone benchmark.

Each workload uses three alternating paired trials, fresh pages, a 1000 × 560
scene, DPR 2, map scale 2, one second of warmup and four seconds of measured
animation. Each build receives the same count, continuous animation and image.
Only one scene runs at a time. Cached movement preserves map geometry;
reshaping changes geometry and light angle. Static WebGL sources use the
existing ImageBitmap source type. Each animation step calls the explicit
WebGL `render()` method, including its source-refresh behavior, in both builds.

The compact [recorded report](../../showcase/recorded-fps.json) retains
configuration, settings, summary, medians, ranges, trial counts, environment
details, engine hashes and fixture hashes; individual frame intervals and trial
data are omitted. The website shows its medians separately from measurements made on a visitor's device.

Higher animation FPS is better. Lower update time is better:

| Scene | Previous FPS | Current FPS | Previous update | Current update |
| --- | ---: | ---: | ---: | ---: |
| SVG, 12 reshaping lenses | 25.25 | 26.00 | 36.52 ms | 35.37 ms |
| SVG, 24 reshaping lenses | 14.38 | 13.94 | 64.06 ms | 66.37 ms |
| SVG, 24 cached moving lenses | 44.00 | 44.00 | 0.463 ms | 0.451 ms |
| WebGL, 24 reshaping lenses | 60.00 | 60.00 | 7.88 ms | 7.02 ms |

The 12-lens SVG case gained 3.0% in median animation FPS in these samples, while
the 24-lens SVG median fell by 3.0%. Ranges overlap in all four cases; these
samples do not establish a general FPS gain. Negative results are retained.
WebGL stayed near the browser's roughly 60 Hz cadence cap while synchronous
update work fell by about 11%. Faster map generation does not remove PNG, SVG
paint, compositor or scheduling costs, and it does not help an already-cached
map. Cached movement does not regenerate maps and serves as a control for
rendering and host variance.

Median trial p95 intervals were 50.1 → 50.1 ms for 12-lens SVG, 83.4 → 83.4 ms
for 24-lens SVG, 33.4 → 33.4 ms for cached movement and 16.7 → 16.8 ms for
WebGL. Three trials on a shared host do not establish statistical significance
or a universal FPS gain. These results describe deliberately heavy scenes,
not a single button on an otherwise idle page.

## Validation

The six map/cache cases passed, including 205 exact PNG and raw-RGBA
comparisons. The seeded previous/current runner additionally compared 640
raw maps. Chromium core/component integration passed 1,486 assertions and the
rebuilt current-core WebGL fixture passed 164 assertions.

The website checks covered a complete six-trial comparison and JSON download,
desktop/tablet/phone layouts, renderer and backdrop switching, cancellation,
real resize and scroll-out invalidation, synthetic hidden-tab invalidation,
reduced motion and phone scene centering. The latest lifecycle checks held
image decoding across consecutive resizes, then verified that Play resumes
while Pause or benchmark disposal prevents further preview rAF requests.

The headless visual inspector found no failures at 1440, 768 and 390 px. Its
two advisory warnings concern the absence of prerecorded video and restrained
parent-page motion; the site uses actual live lens rendering and suppresses
other animation during benchmarks. [The design record](../../showcase/design.md)
documents the render review. Fresh checks used Chromium; Firefox, native
WebKit and physical-phone performance were not rerun for this pass.

## Use the comparison website

The generated site is standalone HTML/JS under `showcase/dist/`. It uses
bundled modules and images and makes no external requests. It supports
side-by-side previews, four backdrops, SVG/WebGL, 4/12/24 lenses, cached movement or reshaping,
three alternating trials, frame-time charts and downloadable JSON. Pausing the
preview resets both lenses to the same geometry for visual comparison.

Measurements dispose preview renderers before running and center the scene in
the viewport. Cancellation, hiding the tab, scrolling the scene out of view or
resizing stops the comparison without publishing a partial score.
Reduced-motion mode leaves previews paused until the visitor starts them.

The first command builds the site from source, demo images and Git history in
the ignored `showcase/dist/` directory. A normal clone with the relevant history
is required; the generated directory can be served independently. The second
builds the site and starts a local server bound to `127.0.0.1`, on port 4173
by default; it does not open a browser. Open that URL manually to use the site. Stop the
server with Ctrl+C. `--port` selects a different port. These commands affect
only the local checkout and local server; no deployment occurs.

```sh
# Generate the standalone site from source and Git history
node scripts/build-showcase.mjs

# Serve the comparison locally without opening a browser
node scripts/serve-showcase.mjs --port 4173
```

The benchmark runners use an existing Playwright module and installed browser,
configured through `LG_PLAYWRIGHT_MODULE` and `LG_CHROME_EXECUTABLE`. They install
nothing, use headless temporary profiles, close them after the run, and write
JSON under `/tmp`. Remove the JSON to discard a run. `LG_FPS_OUT` and
`LG_RASTER_OUT` change output paths. `LG_RASTER_FILE` selects a saved previous
core; `LG_RASTER_CANDIDATE` selects a candidate file. `LG_FPS_ORIGINAL=1` also
measures the optional original build. Build the site first to generate the
baseline files. The runners retain full traces in their output; device JSON
exports from the site also retain full measurements.

```sh
# Measure the current core against the retained previous pass
LG_RASTER_FILE=showcase/dist/builds/previous/liquid-glass.js node review/measure-raster.mjs

# Measure all four animation workloads without opening windows
node review/measure-fps.mjs
```

The browser site measures a smaller, responsive scene fitted to its viewport;
its results can differ from the fixed-size headless report. Its FPS is still
rAF cadence, even in a visible browser. The idle median is a scheduling
reference, not proof of a panel's physical refresh rate. Missed refresh slots
are estimates derived from that reference.
