# Filter refresh validation

This record measures the isolated filter-refresh change against upstream `068ad226f53e1ca62d857f78bdc32f58f3c5fce7`. The saved comparison preserves that candidate; the current library also includes the other fork optimizations. The production change keeps one filter ID and removes map-settling timers in Blink and Gecko. WebKit and unknown engines retain both workarounds. All three `lib/` files match their skill asset mirrors.

On 2026-10-26, 208 original/candidate capture pairs matched every RGBA pixel: 90 Blink, 90 Gecko and 28 native WKWebView. The five behavioral regression tests pass; the original fails the two stable-ID tests. Native fit original-vs-original and original-vs-candidate controls also matched. The initial fixed-delay fixture sampled stale resize state; final runs wait for geometry, PNG dimensions, SVG regions, pending decodes/timers and two animation frames.

After sharing the request-order decode gate, a focused UI recheck of decode races and destruction matched another 24/24 capture pairs. These repeated checks are separate from the 208 primary pairs.

| Settled first lens / 100 explicit flushes | Original | Candidate |
| --- | --- | --- |
| Blink/Gecko filter ID mutations | 3 / 100 | 1 / 0 |
| Blink/Gecko map-settling timers | 2 | 0 |
| Blink/Gecko initial SVG attribute mutations | 182 | 62 |
| WebKit filter ID mutations | 3 / 100 | 3 / 100 |
| WebKit map-settling timers | 2 | 2 |

These are operation counts. Single elapsed-time samples are retained in the JSON; concurrent validation caused noise, so they do not establish a CPU percentage or statistical speedup.

Chrome 156.0.8078.48 and actual Gecko 157 covered 1280×800 and 390×844 at DPR 1/2, phone DPR 1.25, and reduced motion on phone/DPR 2. Native system WKWebView on macOS 27.0.1 (Safari app 27.0.1) covered both widths at display DPR 2. Fourteen shared scenarios cover idle, pressed, a moving pose, squish/graph changes, hidden/re-show, fit/resize, sync/clip, backdrop/fallback, reconnect, reverse decode completion, destruction, no-op and flush. Blink/Gecko also covered a whole iframe moved offscreen during an update.

No physical iPhone, native WebKit DPR 1/fractional/reduced-motion, native offscreen-iframe test, or exhaustive background-tab policy coverage. Captures cover fixed poses and settled numbered replay endpoints, not every animation frame.

## Reproduce locally

Run from this worktree. The server is local to this Mac and stops with Control-C:

```sh
python3 skill/liquid-glass-web/scripts/serve.py . 4382
```

Open `http://127.0.0.1:4382/review/filter-refresh.html`, or open that one HTML file directly. It embeds both actual runtimes and the fixture. `window.comparisonReady` resolves after both load; `runComparison(name)` resolves after capture readiness and publishes `window.lastResult.done`.

The following uses the coordinator's temporary Playwright installation. The temporary Firefox wrapper changes application branding to avoid macOS app-data startup errors; the runner supplies the stock Firefox UA and asserts `engine === 'gecko'`. The actual Gecko renderer is unchanged. No package or browser installation is performed by these commands.

```sh
export LG_PLAYWRIGHT_MODULE=/private/tmp/liquidglass-validation/node_modules/playwright/index.mjs
export LG_FIREFOX_EXECUTABLE=/private/tmp/liquidglass-validation/firefox-isolated
node --test tests/filter-refresh.test.mjs
node review/check-filter-refresh.mjs
```

For the expected original failures, extract its runtime to `/tmp` and point the same behavioral suite at it:

```sh
git show 068ad226f53e1ca62d857f78bdc32f58f3c5fce7:lib/liquid-glass.js > /tmp/liquidglass-filter-baseline.js
LG_LIBRARY_FILE=/tmp/liquidglass-filter-baseline.js node --test tests/filter-refresh.test.mjs
```

Compile the native polling helper with `-O` for optimization and `-o` for the temporary output path. It uses the system WebKit, opens a nearly transparent click-through window, polls the page's completed result every 50 ms, and stops after 15 seconds if completion is missing. It does not drive the user's Safari. Run native captures one thread at a time:

```sh
xcrun swiftc -O review/snap-filter-refresh.swift -o /tmp/liquidglass-filter-snap-ready-webkit
LG_ENGINES=webkit LG_WEBKIT_SNAPSHOT=/tmp/liquidglass-filter-snap-ready-webkit node review/check-filter-refresh.mjs
```

The checker writes PNG pairs, native probe text, a JSONL journal and JSON results under `/tmp/liquidglass-filter-evidence`; `LG_EVIDENCE_DIR` selects another directory. `LG_SCENARIOS=fit,decode-race` narrows a run. `LG_ENGINES=blink` or `gecko` selects one engine. The native helper skips the browser-only offscreen case.

Rebuild the standalone HTML using the fixed Git baseline, current library and retained measurement summary:

```sh
node review/build-filter-refresh.mjs
```

Raw final runs are in `/tmp/liquidglass-filter-evidence/final/comparison-blink-gecko.json`, `comparison-webkit.json`, `offscreen/comparison-blink-gecko.json`, and combined `comparison-all.json`. Corresponding PNGs and native `.png.txt` probes remain in those directories. The retained summary is `review/filter-refresh-evidence.json`. Temporary probes have been removed. `tests/helpers/hold-image-decodes.mjs` is the small request-order gate shared by the direct regression suite and HTML generator; their scenarios and assertions remain separate.
