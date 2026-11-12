# Animation update work

Our 11 November 2026 comparison reduced synchronous update time for 24 moving
SVG lenses from **0.430 ms to 0.200 ms per frame**, a **53.5% reduction** (2.15×
throughput). This exceeds the 30% target for this workload. Browser animation
cadence improved from 43.8 to 45.4 FPS, or 3.5%; the update-time reduction is
not an equivalent FPS or whole-application speedup.

## Change

SVG updates previously wrote each filter primitive's complete rectangle and
displacement scales on every update, even when only position changed. Each
filter graph now remembers the normalized values already applied and writes
only changed attributes. Rebuilding a graph creates fresh state. Resizing the
target recomputes the normalized coordinates, blur and displacement scales;
hidden/show and asynchronous map publication still apply the current filter.
WebKit retains its filter-ID refreshes and settling timers.

Explicit WebGL `render()` calls previously uploaded the complete source again
for each frame, including immutable `ImageBitmap` sources. Once uploaded, a
bitmap now reuses its texture across lens movement, resize, restart and
visibility changes. Context restoration resets the upload state and creates a
new texture. Canvas, image and video sources keep their existing refresh behavior.

The map generator, optical settings, resolution and public API are unchanged.
The library copies bundled with the skill contain the same implementation.

## Before and after

The baseline is the checkout at the start of this task,
`01e3c607ea965b5e0079814e599e605423cb1440`, rather than an older upstream build.
[update-results.json](update-results.json) retains the exact source and fixture
hashes, environment, all 30 trial summaries, medians and ranges. Its candidate
hashes identify the sources at the end of that pass, which can be reconstructed
with [fps-baseline.patch](fps-baseline.patch). The later
[FPS optimization](fps-cpu-canvas.md) has a different core hash.

| Scene | Before update | After update | Less update time | Before FPS | After FPS |
| --- | ---: | ---: | ---: | ---: | ---: |
| SVG, 24 moving lenses | 0.430 ms | 0.200 ms | **53.5%** | 43.82 | 45.37 |
| WebGL, 24 moving lenses | 0.183 ms | 0.158 ms | 13.5% | 60.00 | 60.00 |
| SVG, 12 reshaping lenses | 36.43 ms | 37.85 ms | −3.9% | 24.90 | 24.40 |
| SVG, 24 reshaping lenses | 60.42 ms | 60.13 ms | 0.5% | 15.19 | 15.37 |
| WebGL, 24 reshaping lenses | 7.59 ms | 6.73 ms | 11.4% | 58.50 | 60.00 |

SVG movement's per-trial mean update ranges were 0.428–0.440 ms before and
0.187–0.201 ms after, with no overlap. Its median per-trial 95th-percentile frame
interval remained 33.4 ms. WebGL movement ranges overlap (0.174–0.226 ms before,
0.095–0.212 ms after). The reshaping ranges also overlap, including the slower
12-lens SVG result. These measurements do not establish a general improvement
in reshaping or WebGL FPS.

## Method and reproduction

The existing comparison scene ran in installed Brave / Chromium 157.0.8103.50,
headless, on an Apple M2, with a 1000 × 560 CSS-pixel viewport, DPR 2 and map
scale 2. Each workload used three alternating paired trials, fresh pages, one
second of warmup and four seconds of recorded animation. The same scene,
backdrop and animation function ran against both library snapshots. No CPU
throttling was applied and no other browser checks ran during timing.

Update time measures synchronous JavaScript, canvas work, PNG encoding and
driver submission. It excludes asynchronous image decoding and GPU completion.
FPS is browser `requestAnimationFrame` cadence, not physical display presentation.
Three trials on a shared host do not establish performance on every device.

Set `LG_PLAYWRIGHT_MODULE` and `LG_CHROME_EXECUTABLE` to an existing Playwright
installation and browser, as described in the repository README. This command
builds temporary local snapshots, runs the five workloads, saves full timings
under `/tmp` and closes the browser and server. It installs nothing and does
not deploy the app. Delete the output JSON to discard a measurement.

```sh
LG_FPS_BASE=01e3c607ea965b5e0079814e599e605423cb1440 \
LG_FPS_OUT=/tmp/liquidglass-update-results.json \
node review/measure-fps.mjs
```

`LG_FPS_BASE` replaces only the temporary `previous` snapshot with the requested
commit and records its revision and hashes. Without it, the runner retains its
historical default baseline. The new WebGL movement case uses the existing
movement scene and exercises explicit `render()` calls with an immutable bitmap.

Historical raster, menu and FPS records remain unchanged. The standalone
showcase's saved report still describes its dated earlier source hashes.

## Validation

- The new SVG regression check failed against the saved starting core because
  unchanged updates rewrote its filter attributes, then passed with our change.
  All four selected Chromium/unknown-engine lifecycle checks passed, covering
  pixel snapping, optics, resize, rebuild, hidden/show, delayed decode ordering,
  retained refresh timers and destruction.
- All six map/cache checks passed, including 205 byte-exact PNG and raw-RGBA
  comparisons against the maintained upstream fixture. Cache budgets, aliases,
  eviction, first decode and teardown remain covered.
- Chromium core/component integration passed 1,486 assertions over desktop,
  phone-sized and reduced-motion cases. Desktop captures matched exactly;
  phone captures retained raster variation and are not claimed pixel-exact.
  All 26 menu and segmented-control regression tests passed.
- The rebuilt current-source WebGL fixture passed 189 assertions in each of
  six Chromium viewport/DPR/motion configurations (1,134 total). Pixel readbacks
  matched exactly. Checks cover the initial and repeated stopped bitmap renders,
  restart, resize, visibility, mutable sources and real context loss/restoration.
- Native macOS WebKit 22625.2.8.11.9 passed 18 focused explicit-render assertions
  at each of 1280 × 900 and 390 × 844 (36 total), with real backing DPR 2. These
  compare bitmap pixels and texture reuse, plus mutable-canvas refreshes.
  Full native animated integration remains unverified: both the unchanged
  baseline and candidate timed out, and the upstream idle-loop check received
  no frames. Retrying with a fully visible temporary window did not resolve it.
  Those suites need a WebKit environment that delivers animation callbacks.
- Independent static and evidence reviews found no actionable defect. Final
  library and fixture snapshots for this pass match the timing report. Syntax, metrics tests,
  bundled-library synchronization and `git diff --check` passed.

Firefox, physical iPhone performance, production deployment and energy use were
not tested. The native focused checks do not establish Safari animation cadence.
