# Refactor decisions

Scope: preserve the public library API, rendered appearance and interactions while
making related changes local. Comment and test cleanup are included. Historical
comparison HTML, measurements and performance claims remain historical records.

## Decisions and problems

- Give the optical model one map identity and encapsulate the SVG map cache in
  the core module, keeping the standalone distribution contract.
  - Hidden link: `lib/liquid-glass.js` and `lib/glass-webgl.js` repeat the list of
    fields that change map pixels.
  - Needless link: cache lookup, pixel equivalence, aliases, memory accounting,
    PNG decoding and filter publication share loose module state.
- Give surface scroll coordination its own lifecycle, separate from an
  individual surface's backdrop and geometry.
  - Hidden link: global sets and animation-frame state in `lib/components.js`
    require each surface to follow registration and teardown conventions.
  - Hidden link: decorative label copies repeat identical copying
    rules where doing so simplifies the control, without merging distinct gestures.
- Separate site language, code examples, navigation, demonstrations and playground
  behavior behind explicit imports.
  - Needless link: `assets/site.js` contains unrelated page features and owns the
    language listener array used by both code examples and the playground.
  - Hidden link: playground defaults, slider ranges and labels use parallel lists.
  - Surplus: the mobile game navigation CSS selects anchors, while its markup
    contains buttons; this rule currently has no effect.
- Share fixture and runtime tooling between comparison builders and regression
  runners, and load historical sources only when a comparison requests them.
  - Hidden link: importing builders from tests runs Git history reads at module
    load, including histories unused by the caller.
  - Hidden link: the combined fixture injects code by replacing an exact readiness
    string in the surface fixture.
  - Needless link: PNG readers import a private Playwright implementation file.
  - Hidden link: test runners use different environment variables and assume a
    particular macOS Chrome installation.
  - Hidden link: the WebGL builder imports a test runner's assertions.
- Make distribution checks and operational boundaries explicit.
  - Hidden link: skill library copies depend on remembering a manual copy step,
    with no read-only drift check.
  - Special case: installer replacement deletes the previous installation before
    copying its successor, and the download pipeline obscures failure ownership.
  - Special case: deployment and capture scripts assume paths without spaces or
    tools outside the declared platform contract.
- Clean comments and tests after structural work.
  - Remove implementation narration and dead code, keeping public contracts,
    optical equations, licensing and browser constraints.
  - Keep performance, pixel, accessibility, lifecycle and race regression checks.
    Rewrite fragile internal checks only when a behavior-based check protects the
    same requirement. Do not erase meaningful tests to obtain a passing run.

## Retained requirements

- Browser filter refreshes (including conservative unknown-engine behavior) and
  delayed refresh cancellation are compatibility requirements.
- Pending map decode and video callback generations prevent obsolete work from
  changing the current or destroyed renderer.
- SVG data URLs must decode before publication. Decode rejection currently falls
  back to browser loading; preserve this behavior unless evidence justifies a change.
- Cache size, byte budgets and pixel equivalence are deliberate performance policy.
- Canvas and image sources remain live. Static bitmap and paused video may sleep.
- Three backdrop modes, nested scroll alignment and late image loads remain supported.
- Segmented controls and navbars retain their distinct semantics, RTL and gestures.
- The two site translation formats and the independent skill demo remain supported.
- Clipboard feedback, toast duration, clock interval and browser settling waits
  represent user feedback or asynchronous browser work, not arbitrary retries to delete.
- Upstream credits and destinations are content choices, outside this refactor.

## Validation

Validated locally on 2026-11-06. The initial working tree was clean. A temporary
archive of `HEAD` supplied the before-refactor site and segmented-control baseline.
No packages were installed, and no production server was contacted.

- Baseline and refactored segmented controls: all 15 tests passed in Brave
  157.0.8103.39 (Chromium), including keyboard/radio semantics, pointer and touch
  gestures, cancellation, RTL, forced colors, reduced motion and teardown.
- Filter lifecycle: all three selected Blink/unknown-engine tests passed,
  including delayed decode ordering and destruction. Gecko cases were not run.
- Map cache: all six checks passed, including 20 byte-identical optical maps,
  alias reuse, LRU eviction, retained byte budgets and asynchronous publication.
- Combined core/components: all three desktop/phone and normal/reduced-motion
  configurations passed, including real pointer motion, nested scrolling,
  image-driven layout shifts, reconnect and teardown. Desktop captures matched
  upstream exactly; phone captures retained the documented rasterization noise.
- WebGL: all six Chromium viewport/DPR/motion configurations passed, with 164
  assertions each. This covers static/live sources, video, resize, visibility,
  context restoration and teardown. Static idle source uploads fell to zero.
- Native macOS WebKit: original and current combined fixtures passed at 390 × 844,
  DPR 2, including retained filter refreshes, scrolling and a 110 px image shift.
- Site: homepage and documentation passed language, clipboard and interaction
  checks at 1280 px and 390 px, in English and Chinese. Playground settings and
  notifications were exercised. Before/after captures received independent visual
  review with no visible layout regression. Pixel differences also occur in
  baseline-repeat captures, so site captures are not claimed to be pixel-identical.
- Tooling: fixture imports succeed without Git available; PNG decoding matched
  the public `pngjs` decoder for RGB/RGBA and all five filters. Mocked installer
  download/copy failures kept the previous installation, successful replacement
  worked, and mocked deployment accepted key paths with spaces and apostrophes.
- All 40 JavaScript modules passed syntax checks, shell syntax passed, every
  relative module import resolved, `git diff --check` passed, and the read-only
  skill synchronization check passed.

The dedicated surface-scroll suite also passed all three configurations. Its
35-position replay retained 33,524 → 8,561 geometry reads on desktop and
33,524 → 8,569 on phone, with zero candidate reads at idle or for unrelated
scrolls. Desktop captures were exact; phone cross-comparisons differed by at most
one channel value, while repeat controls showed larger browser rasterization
variation. The capture script's missing-argument path also returned its documented
usage failure.

Independent final static reviews of the library, site and tooling found no
remaining actionable structural problems. Shared helpers were moved out of the
test directory; no behavioral regression assertions were removed. Existing
pixel/performance checks protect deliberate optimization contracts rather than
duplicating implementation for its own sake.

New runtime evidence is under `/tmp/liquidglass-untangle-evidence/`, with `site`,
`map`, `combined`, `native`, `webgl` and `scroll` subdirectories. The committed
historical comparison HTML, measurements, charts and source hashes were preserved.
These checks do not establish new CPU performance measurements, physical iPhone
behavior, or Firefox runtime equivalence. Firefox was unavailable locally.

Use the shared environment setup in the README, then the existing runners:
`node --test tests/segmented.test.mjs`,
`node --test tests/filter-refresh.test.mjs`, `node tests/map-cache.mjs`,
`node tests/combined-integration.mjs chromium`, and
`node tests/surface-scroll.mjs chromium`. WebGL checks should use a freshly built
temporary comparison, as described in `review/webgl-demand.md`, to avoid testing
the historical saved candidate.

Core and WebGL files belong to the same release because WebGL imports the shared
map identity. No deployment or cache rollout was performed. Publishing these
source changes does not deploy the site or create a pull request.
