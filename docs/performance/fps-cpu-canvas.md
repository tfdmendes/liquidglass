# SVG animation FPS

The 12 November 2026 comparison measured **27.0 → 60.0 FPS (+122.2%)** for
12 reshaping SVG lenses and **15.8 → 38.5 FPS (+143.4%)** for 24. Both exceed
the requested 30% FPS improvement against our implementation after the
[previous update-work optimization](updates.md).

These are browser animation-cadence measurements in headless Chromium on an
Apple M2. They do not measure frames physically presented by a display or
establish the same gain on every browser, device or workload.

## Change and mechanism

SVG displacement maps start as CPU-generated `ImageData`. The engine writes
those pixels into a canvas, immediately encodes a PNG with `toDataURL()`, waits
for image decoding, and publishes it to an SVG filter. Profiling the previous
12-lens implementation found about four seconds inside PNG serialization during
a five-second animated replay. The default canvas path was the dominant stall.

The private SVG map cache now requests a 2D context with
`willReadFrequently: true`. This asks the browser to favor frequent pixel reads;
avoiding accelerated-canvas readback is the supported explanation for the
measured reduction. The experiment did not directly inspect GPU allocation.

The context setting applies only to canvases immediately serialized as PNG.
The exported `renderLensMap()` and WebGL texture path keep their existing
context defaults. Map resolution, optics, scene dimensions, lens count and
animation functions are unchanged. Encoding and publication retain the same
synchronous-encoding / asynchronous-decoding lifecycle, with the existing cache
budgets and stale-decode guards. No worker, encoding queue or runtime dependency
was added. The bundled skill copies match the library.

## Before and after

Values are medians of **five alternating paired trials per scene**, with a fresh
page per build. Each trial uses a 1000 × 560 CSS-pixel scene, DPR 2, map scale 2,
the city image, one second of warmup and four seconds of measurement. No CPU
throttling or concurrent browser checks ran during the FPS measurements.
The browser was installed Brave / Chromium 157.0.8103.50 on macOS 27.2, Apple M2.

| Scene | Before FPS | After FPS | Higher FPS | Before p95 frame | After p95 frame |
| --- | ---: | ---: | ---: | ---: | ---: |
| SVG, 12 reshaping lenses | 27.00 | 60.00 | **122.2%** | 50.0 ms | 16.7 ms |
| SVG, 24 reshaping lenses | 15.82 | 38.50 | **143.4%** | 66.7 ms | 33.4 ms |
| SVG, 24 cached moving lenses | 43.82 | 43.82 | 0.0% | 33.4 ms | 33.4 ms |
| WebGL, 24 reshaping lenses | 60.00 | 60.00 | ≈0.0% | 16.7 ms | 16.7 ms |
| WebGL, 24 moving lenses | 60.00 | 60.00 | ≈0.0% | 16.7 ms | 16.7 ms |

The 12-lens FPS ranges were **25.79–27.27 before** and **60.0015–60.0030 after**.
The 24-lens ranges were **15.50–15.82 before** and **38.09–38.66 after**. Neither
pair overlaps. The 12-lens optimized scene reached the approximately 60 Hz
headless rAF ceiling. Cached movement does not encode new maps, and WebGL does
not use the SVG encoder, so those controls show no material FPS change.

[fps-cpu-canvas-results.json](fps-cpu-canvas-results.json) retains all 50 trial
aggregates, medians, ranges, environment and exact source/fixture SHA-256 hashes.
The formula is `(after FPS / before FPS - 1) × 100`. FPS comes from frame count
divided by measured elapsed time; it is not inferred from JavaScript update time.
Per-frame arrays are omitted from the retained summary and can be regenerated.

## Rendering and freshness

The existing 205 public raw-map/PNG comparisons remain byte-exact. A separate
640-map seeded comparison of default and readback-oriented canvas serialization
found 7,699 changed RGB bytes across the corpus, with a maximum difference of
one 8-bit channel value. Alpha and fully opaque pixels were exact; differences
were confined to partially transparent edge colours from canvas rounding.
The private PNG data URLs therefore are not claimed byte-identical across
canvas backing stores. Maintained cache checks compare decoded pixels with
these explicit bounds and still require one shared URL, encode and decode for
equivalent shapes.

The current implementation passed seven map/cache checks and all four selected
Chromium/unknown-engine filter lifecycle checks. Core/component integration
passed over desktop, phone and reduced-motion cases. The three desktop states
matched upstream exactly; phone captures were not pixel-exact.
All 26 menu/segmented-control tests passed. The rebuilt current-source WebGL
fixture passed 189 assertions, including exact readbacks, live sources and
context restoration. Syntax, metrics tests, skill synchronization and diff
checks also passed.

A separate before/after rendering check covered fractional lenses,
high-contrast text/checkerboards with refraction 64, transparent content,
blurred panels and unclipped lenses at three deformation states each. All
15 cross-comparisons were pixel-exact, at 864,000 pixels per capture. One
baseline-repeat control differed at five pixels by up to seven channel values;
captures do not establish every intermediate frame or browser.

A separate instrumented check found that the higher FPS also delivered maps
more frequently, without an accumulating decode backlog. Publication age starts
immediately before PNG serialization and ends at the SVG `href` update. It
excludes raw raster generation and does not measure physical presentation.

| Scene | Before publication p95 | After publication p95 | Before max pending decodes | After max pending decodes |
| --- | ---: | ---: | ---: | ---: |
| 12 reshaping SVG lenses | 50.7 ms | 12.7 ms | 19 | 20 |
| 24 reshaping SVG lenses | 84.9 ms | 40.0 ms | 38 | 38 |

Every requested decode completed; all four before/after runs had zero pending
decodes 250 ms after stopping. These are focused diagnostic samples, not latency
guarantees. The timing, encoding, rendering and freshness aggregates are retained
in the same results JSON.

The before snapshot includes the earlier SVG attribute and immutable-bitmap
optimizations. It is not the older Git `previous` build used by historical
reports. Those reports and the showcase's dated saved measurements remain
unchanged.

## Reproduce

Run from the repository root. The first block reconstructs the exact prior-pass
baseline in `/tmp/liquidglass-fps-baseline-20261112` from the fixed commit and
the retained [baseline patch](fps-baseline.patch), then verifies its hashes.
It writes only those three temporary module files; the patch is not applied to
the working checkout. It uses Python's standard library and the existing Git
and `patch` commands.

```sh
python3 - <<'PY'
from pathlib import Path
import hashlib
import json
import subprocess

root = Path.cwd()
destination = Path('/tmp/liquidglass-fps-baseline-20261112')
destination.mkdir(exist_ok=True)
report = json.loads((root / 'docs/performance/fps-cpu-canvas-results.json').read_text())
for name, expected in report['manifest']['builds']['previous']['sha256'].items():
    data = subprocess.run(['git', 'show', f'01e3c607ea965b5e0079814e599e605423cb1440:lib/{name}'], check=True, capture_output=True).stdout
    (destination / name).write_bytes(data)
subprocess.run(['patch', '--strip=2', f'--directory={destination}', f'--input={root / "docs/performance/fps-baseline.patch"}'], check=True)
for name, expected in report['manifest']['builds']['previous']['sha256'].items():
    assert hashlib.sha256((destination / name).read_bytes()).hexdigest() == expected
PY
```

Set `LG_PLAYWRIGHT_MODULE` and `LG_CHROME_EXECUTABLE` to an existing installation
as described in the repository README. This command builds temporary local
snapshots, runs all five scenes, writes full timing traces under `/tmp`, and
closes the browser and loopback server. It installs nothing and deploys nothing.
Deleting the temporary directory and output JSON removes the generated files.

```sh
LG_FPS_BASE_DIR=/tmp/liquidglass-fps-baseline-20261112 \
LG_FPS_TRIALS=5 \
LG_FPS_OUT=/tmp/liquidglass-fps-results.json \
node review/measure-fps.mjs
```

`LG_FPS_CASE=svg-reshape-12` selects one scene. `LG_FPS_CANDIDATE_DIR` can select
another saved set of three modules; without it, the candidate comes from `lib/`.
`LG_FPS_BASE` still selects a Git commit and is mutually exclusive with
`LG_FPS_BASE_DIR`. Omitting these options preserves the historical defaults.

Firefox, physical iPhone performance, energy use and production behavior were
not measured. Full native WebKit animation checks remain subject to the
previously recorded environment limitation; Chromium results do not establish
Safari FPS. The gain applies to the measured SVG reshaping workloads, not an
already-cached map or every page using the library.
