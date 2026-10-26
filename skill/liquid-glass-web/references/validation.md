# Fork validation and evidence limits

Read this when changing the bundled engine or components, or assessing performance and browser-coverage claims. For an application that uses the skill, verify its own controls, backdrop alignment and lifecycle as well; library checks do not prove an application's behavior.

## Recorded coverage

The fork's [combined validation record](https://github.com/tfdmendes/liquidglass/blob/main/review/combined-validation.md) documents the 2026-10-26 checks and exact library hashes. It covers Chrome 156 and Firefox 157 at desktop and phone-sized viewports, including reduced motion, plus bounded native macOS WKWebView checks. Cases include map reuse, stable Blink/Gecko filter ids, retained WebKit refreshes, pending decodes, press/cancel, document and nested scroll, source layout changes, reconnect and teardown. Separate WebGL quick checks compare pixel readback.

These checks compare the fork with upstream within each engine. They do not establish identical pixels across browsers. Chrome phone captures were not pixel-exact, and native WebKit coverage was limited to sampled states. Physical iPhone behavior, stock Safari/Firefox application behavior and real background-tab suspension were not established.

The [performance evidence](https://github.com/tfdmendes/liquidglass/blob/main/docs/performance/README.md) measures four changes separately against upstream. Operation counts are not CPU savings and cannot be added into a combined speedup. CPU samples describe the recorded workloads; mostly-new maps had a small median CPU increase. Use those records with their source hashes and limits rather than promising a general speedup.

## When changing library files

In the fork checkout:

1. Edit the canonical files in `lib/`, then run `sh scripts/sync-skill.sh` from the repository root to replace their three bundled copies.
2. Follow `review/combined-validation.md` for current core/component checks and `review/webgl-demand.md` for WebGL checks. Those records describe commands, existing browser/Playwright prerequisites and temporary output paths. Use the affected suites; a screenshot cannot check cache or scheduling behavior.
3. Keep newly observed results separate from the recorded 2026-10-26 evidence. Report the source revision, browser versions, viewport sizes and checks that could not run.

An installed skill does not include the repository's test harness. If it is unavailable, validate the consuming application with its existing tools and state that the fork's regression suites were not rerun. The bundled three-engine screenshot helpers are macOS-specific; unavailable engines remain explicit coverage gaps.
