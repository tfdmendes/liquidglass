# WebGL demand rendering

The branch is `fix/webgl-render-on-change`. HEAD remains `068ad226f53e1ca62d857f78bdc32f58f3c5fce7`; all changes are uncommitted. The runtime catalog confirmed `codex / gpt-6.1-sol`, `reasoningEffort=max`, `serviceTier=default`.

`webgl-demand.html` is the standalone review artifact. It embeds the actual baseline from `git show 068ad226:lib/...`, the candidate, the same generated backdrop, and local media. Each runtime runs in its own iframe. No build or CDN is needed to open it. State controls and replay update both panels together. Pixel captures read WebGL immediately after drawing; the overlay and amplified difference use those real samples.

## Behavior

- Immutable `ImageBitmap` sources and paused/ended video sleep until a source, lens, size, DPR or visibility signal requires drawing
- Live canvas and `HTMLImageElement` sources remain continuous. Chrome's actual baseline uploads different frames from animated SVG; load/error events and filename extensions cannot safely identify a static image. No new API or source flag was added
- Playing video uses `requestVideoFrameCallback` when available. Browsers without it retain animation-frame updates while playing
- Lens-only changes reuse the source texture. Reshaping uploads its map; moving reuses the map. The map key includes DPR
- Stop keeps the displayed frame. Explicit `render()` refreshes the source while stopped. Destroy cancels pending callbacks, removes observers/listeners and releases the GPU resources. Context restoration recreates resources

## Recorded evidence

Raw measurements and pixel summaries: [`webgl-demand-results.json`](webgl-demand-results.json). Full browser screenshots and original runner output: `/tmp/liquidglass-webgl/matrix/`.

The Chrome 156.0.8078.48 / Blink and Firefox 157 / Gecko matrix passed all 12 runs, totaling 1,962 assertions. Both tested 1280×900 and 390×844 at DPR 1, 1.5 and 2, with normal and reduced motion. All compared pixel samples matched exactly within the same engine. Tests cover idle/pressed/moving/settled/removed lenses, source mutation and loading, SVG/GIF/APNG, video callback/fallback play/pause/seek/end/reload, resize, offscreen/resume, disconnect/reconnect, repeated start/stop, explicit stopped render, destroy and real context loss/restore.

Representative desktop samples below count actual WebGL calls. They are operation counts, not CPU percentages or per-call timings. Concurrent work and browser throttling affect elapsed duration and delivered frame counts.

| Engine / source | Sample | Draws, original → candidate | Source uploads, original → candidate |
| --- | --- | --- | --- |
| Blink / idle ImageBitmap | 302 ms | 36 → 0 | 18 → 0 |
| Blink / moving ImageBitmap | 301.2 ms | 36 → 18 | 18 → 0 |
| Blink / paused video | 301.7 ms | 36 → 0 | 18 → 0 |
| Blink / playing 12 fps video | 351 ms | 14 → 8 | 7 → 4 |
| Gecko / paused video | 304 ms | 38 → 0 | 19 → 0 |
| Gecko / playing 12 fps video | 352 ms | 42 → 8 | 21 → 4 |
| WebKit / idle ImageBitmap | 301 ms | 36 → 0 | 18 → 0 |
| WebKit / playing 12 fps video | 350 ms | 42 → 8 | 21 → 4 |
| Blink / live canvas | 301 ms | 36 → 36 | 18 → 18 |
| Blink / HTMLImageElement | 200.7 ms | 24 → 24 | 12 → 12 |

After removing the redundant video setup, focused callback/fallback checks passed in both engines (36 assertions), including paused lens changes without source upload, exact seek/end/reload pixels, and destruction with a video callback queued. No broader matrix was repeated for that test-only cleanup.

Live DPR signal checks at 2 and 1.5 each caused two quad draws, one map upload and zero source uploads, with exact pixels against a freshly created original map. DevTools changes DPR without emitting resize/media-query events, so this diagnostic supplied the standard resize signal. The original map was refreshed because its cache key omits DPR.

Native WKWebView uses WebKit `22625.1.29.11.28` on macOS 27.0.1 (26A434), DPR 2. Final-source desktop (1280×900) and phone-sized (390×844) runs each passed 163 assertions and 41 exact pixel samples, including the initial 1164×440 / 776×440 readbacks and two animated SVG frames. They waited for the explicit result, finishing in 16.7 s and 15.0 s. Raw JSON/PNG files are `/tmp/liquidglass-webgl/webkit-desktop.*` and `webkit-phone.*`. The native slot was released immediately after both processes exited.

## Reproduction

Run from this worktree. These commands read the fixed baseline, write the generated review HTML or validation output, and launch temporary browser processes. They do not change Git history or install dependencies.

```bash
# Rebuild the standalone page from the fixed original and the current candidate
node scripts/build-webgl-review.mjs

# Use the coordinator's existing isolated Playwright and Firefox installation
PLAYWRIGHT_MODULE=/private/tmp/liquidglass-validation/node_modules/playwright/index.mjs \
FIREFOX_EXECUTABLE=/private/tmp/liquidglass-validation/firefox-isolated \
node tests/webgl-demand.mjs

# Serve this worktree on loopback port 4384, with caching disabled
python3 skill/liquid-glass-web/scripts/serve.py . 4384
```

Open `http://127.0.0.1:4384/review/webgl-demand.html`, or open the HTML file directly. `window.reviewReady` and visible `Ready` indicate initialization. `?check=1` runs the same in-browser checks and exposes `window.webglResults`. The runner normally opens the file directly and writes JSON/screenshots to `output/playwright/webgl-demand/`. `--quick` selects one desktop case per engine; `--engine chromium` or `--engine firefox` narrows engines; `--output PATH` changes the evidence directory.

The isolated Firefox wrapper runs the Firefox 157 binary with temporary Name/Vendor branding to avoid the macOS app-data startup issue. The runner sets the original Firefox UA and asserts `engine === 'gecko'`; production engine detection is unchanged. `PLAYWRIGHT_MODULE`, `FIREFOX_EXECUTABLE`, and optional `CHROME_EXECUTABLE` allow other existing installations. No package dependency or system browser was modified.

```bash
# Keep the compiled helper and captures in the temporary task directory
mkdir -p /tmp/liquidglass-webgl

# Compile the task's readiness-based WKWebView helper into a temporary executable
xcrun swiftc -O review/snap-webgl-demand.swift -o /tmp/liquidglass-webgl/snap-webgl-demand

# Run native captures serially so their nearly transparent windows do not interfere
/tmp/liquidglass-webgl/snap-webgl-demand \
  'http://127.0.0.1:4384/review/webgl-demand.html?check=1' \
  /tmp/liquidglass-webgl/webkit-desktop.png 1280 900 50
```

The native arguments are URL, output PNG, CSS viewport width/height, and the maximum readiness wait in seconds. It polls `window.webglResults`, records JSON alongside the PNG, and exits unsuccessfully on assertion failure or timeout. It retains the repository helper's nearly transparent on-screen window because WebKit pauses hidden views. For the phone-sized check use `390 844` and a separate PNG path. The helper uses the screen's backing scale, not physical iPhone hardware. Exit the local server with `Ctrl+C`; deleting validation output removes generated evidence only.

## Limits

- Visibility handling is tested with actual `visibilitychange` events and an overridden `document.hidden` getter. Headless tabs remained visible when switched; native background-tab suspension was not demonstrated
- Reduced-motion coverage is a browser preference test. It does not stop video or externally animated canvas content
- Readback checks are within one engine. They do not claim Chrome, Gecko and WebKit have identical color management. Firefox screenshots are supplementary; WebGL correctness uses pixel readback
- Playing videos decode independently. Use **Pause at 0.5 s** for deterministic visual comparison
- No physical iPhone or stock Firefox app was tested. CPU percentage, energy use and full-page application performance were not measured
