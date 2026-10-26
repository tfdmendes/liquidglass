# Performance evidence

These figures use measurements from the 26 October 2026 review. Each of the four
changes was measured **independently** against upstream
`068ad226f53e1ca62d857f78bdc32f58f3c5fce7`. They do not measure the integrated
fork or establish a combined speedup. The original engine is by
[gentpan](https://github.com/gentpan); the project retains its upstream MIT license.

![Operation counts for four independently measured changes; each original is normalized to 100%, with absolute counts shown](operation-counts.svg)

The rows count different operations. Their bar lengths can be compared within a
row; the counts cannot be added or interpreted as CPU savings.

| Measurement | Original → individual change | Same workload in both variants |
| --- | --- | --- |
| Map PNG encodes | 149 → 41 | Button, 12 deterministic press/release cycles; Chrome 156, 1280 × 900, DPR 2 |
| Initial SVG attribute writes | 182 → 62 | One static lens; Blink and Gecko recorded the same counts. Native WebKit remained 197 → 197 |
| Scroll geometry reads | 33,524 → 8,561 | 35 scroll positions with 240 extra surfaces; Chrome 156, 1280 × 800, DPR 1. The phone run recorded 8,569 candidate reads |
| Idle WebGL source uploads | 18 → 0 | An unchanged ImageBitmap, sampled over 302 ms; Chrome 156, 1280 × 900, DPR 1 |

Live canvas and HTMLImageElement sources still render continuously. The idle
ImageBitmap result does not describe every WebGL source or active animation.

![Map-cache CPU medians and three-trial ranges on a shared zero-based millisecond scale, including mostly-unique workload overhead](cpu-time.svg)

CPU measurements used three fresh-browser trials per variant, alternating order,
in Chrome 156.0.8078.48 (Blink) and Firefox 157.0 (Gecko), at 1280 × 900 and DPR 2.
Button and segmented replays used 12 cycles; the mostly-unique workload generated
1,200 maps while changing optical parameters. Fixed 60 Hz spring steps were
replayed faster than wall clock, so native paint work could be coalesced.

CPU time is the change in macOS `ps` accumulated CPU time for the browser process
and its descendants, including map generation, equality checks, canvas upload,
PNG encoding/decoding and rendering tasks. Resolution is 10 ms per process.
WindowServer and graphics drivers are excluded. Final decode/repaint waits remain
inside the sampled interval. This does not measure CPU utilization, energy, FPS
or real-time frame cost. The mostly-unique median increased by 40 ms in Chrome
(+1.5%) and 20 ms in Gecko (+1.1%). Shared-host variance is visible in the ranges;
three trials do not establish statistical significance.

## Retained data and reproduction

[evidence.json](evidence.json) retains exact selected JSON subtrees, all 36 CPU
sample values, source SHA-256 hashes, JSON pointers and the reviewed candidate
module hashes. It omits process IDs, screenshots and unrelated test output.
The hash of `orchestrator-review.md` identifies the coordinated review behind
the broader caveats below.

| Source ID | Original measured artifact | Used for |
| --- | --- | --- |
| `map_summary` | `map-cache-results.json` | CPU medians/ranges and visual summary |
| `map_blink` | `blink-cpu-final.json` | Raw Chrome CPU samples and button operation counts |
| `map_gecko` | `gecko-cpu-final.json` | Raw Gecko CPU samples |
| `filters` | `filter-refresh-evidence.json` | Initial SVG writes and native unchanged counts |
| `scroll` | `surface-scroll-results.json` | Desktop/phone reads and phone repeat controls |
| `webgl` | `webgl-demand-results.json` | The named idle ImageBitmap sample and its runtime |

Run from the repository root with Python 3; no packages or browser are needed.
The first command replaces only the two SVGs. The second checks their XML,
recomputes CPU medians/ranges from the retained samples, checks them against the
review summary and compares the generated SVGs byte for byte without writing.
Regeneration redraws existing evidence; it does not rerun the browser benchmarks.

```sh
python3 docs/performance/generate.py
python3 docs/performance/generate.py --check
```

When a complete original artifact is available, add
`--verify-source ID=PATH` to check its SHA-256 and every retained JSON pointer.
The source IDs are listed above; the path is supplied locally and is not saved.
SVGs have accessible titles/descriptions, an opaque background and embedded
light/dark colors. They contain no script, embedded font or external asset.

## Visual evidence limits

The review covered Blink, Gecko and native macOS WebKit, including desktop and
390 × 844 layouts. Map checks compared exact RGBA map output; Gecko rendered
states were exact, while Chrome's maximum one-channel difference of 1 also
occurred in original-versus-original controls. Native WebKit map captures were
limited to two states at backing DPR 2 on macOS 27.0.1.

Filter comparisons recorded 208 exact RGBA pairs. Scroll captures were exact in
Gecko, desktop Chrome and the sampled native WebKit states. **Phone Chrome scroll
captures were not pixel-exact**: cross-comparisons changed 203/510/197 pixels,
with repeat-control differences too. An unfiltered gradient boundary reached a
one-channel difference of 165 in cross and repeat controls; the remaining
differences were at most 1. The native large-scene scroll replay used seven
positions, so it does not supply the plotted 35-position operation counts.

No physical iPhone was tested. Native WebKit does not cover every DPR,
reduced-motion setting or live backdrop. Captured states do not prove every
intermediate frame or historical browser version. Real background-tab suspension
was not established by the synthetic visibility and viewport checks.

The generated figures passed XML and deterministic-output checks. Browser image
renders were inspected at 760 px and 360 px in light and dark themes, with no
horizontal overflow. This checks local SVG rendering; it is not a live GitHub
or physical-phone test.
