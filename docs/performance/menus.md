# Menu and navigation animation

Menu opening previously resized the refractive surface on every spring frame.
Fractional heights created new displacement maps, PNG encodes and image decodes.
Row and navbar highlights also regenerated maps for small changes in their
stretch, and repeatedly read layout during animation.

Opening now scales and fades the full panel with the existing interruptible
spring. The glass keeps its full-size map. This intentionally scales the labels
and backdrop during entry, whereas the earlier animation shortened only the
glass surface. The settled panel retains its geometry and optical settings.
Backdrop copies use the panel's fixed top-left origin while it scales.

Highlights keep their sliding and stretching motion. Their dimensions snap to
device pixels before requesting maps, avoiding new maps for subpixel changes.
Item geometry is measured on input and resize instead of every spring frame.
Closed menus leave scroll synchronization, and removal stops active springs.
The standalone library and bundled skill contain the same implementation.

The navbar flushes its glass and shadow in one paint so both layers use the same
position. Hover and focus still preview a section; clicking still selects it.
The showcase's press-and-drag behavior and website changes are separate.

## Measurements

[Raw trials](menu-results.json) compare `a863784` with the corrected components
on 7 November 2026, using installed Brave 157.0.8103.39, headless Chromium,
1280 × 800, DPR 2, and DevTools CPU throttling at rate 4. Each workload has three
alternating paired trials, with a fresh page per variant. Each six-second replay
changes a target every 180 ms using synthetic input events on real components.
The JSON retains source/fixture hashes, configuration and all sample values.

Values below are medians. Browser task time is accumulated main-thread work
during the replay, measured through Chromium's Performance domain.

| Workload | PNG encodes, before → after | Browser task time, before → after | rAF FPS, before → after |
| --- | --- | --- | --- |
| Open, switch and close menus | 527 → 3 | 4628 → 288 ms | 58.7 → 59.8 |
| Move between menu rows | 221 → 14 | 1246 → 451 ms | 60.0 → 60.0 |
| Move the navbar highlight | 342 → 103 | 1658 → 873 ms | 60.0 → 60.0 |

For opening, median per-trial 95th-percentile frame interval was 16.8 ms before
and 16.7 ms after. FPS ranges were 57.7–59.3 before and 59.8–60.0 after. Rows and navbar
were already at the approximately 60 Hz rAF ceiling in this fixture. These
samples demonstrate lower rendering work under the specified CPU throttle.
They do not establish a general FPS gain.

A preliminary unthrottled baseline also reached 60 FPS. This isolated fixture
does not reproduce the user's full severity on the unthrottled development Mac.
CPU throttling simulates constrained execution and is not a measurement of a
physical slower device. rAF cadence does not measure physical frame presentation,
GPU completion, power, or native Safari FPS. Shared-host load affected timings,
and three trials are too few for a statistical significance claim.

## Reproduce

Use the existing Playwright installation and browser overrides described in the
root README. No runner installs browser software. Run from the repository root:

```sh
# Compare the retained baseline with the current files on a temporary loopback server
LG_MENU_CPU_RATE=4 node review/measure-menus.mjs

# Check keyboard, pointer, animation work, alignment, resize and component teardown
node --test tests/menus.test.mjs
```

The first command reads baseline modules through `git show`, launches temporary
browser profiles, and writes `/tmp/liquidglass-menu-results.json`. It closes its
server and browser afterward. Remove that JSON to discard the measurement.
Omit `LG_MENU_CPU_RATE` for normal execution. `LG_MENU_OUT` changes the output path;
`LG_MENU_BASE` chooses a baseline revision. `LG_MENU_TRIALS` changes the number of
trials, and `LG_MENU_BUILDS=previous` or `current` runs just one variant.
`LG_MENU_EVIDENCE_DIR` optionally captures settled desktop states after measurement.

## Validation and limits

The menu and segmented-control suites passed 26 tests in installed Brave /
Chromium. They cover stable opening maps, real pointer and keyboard selection,
menu switching, rapid reversal, removal/reinsertion, position-only row and navbar
layout changes, resized labels, scaled backdrop alignment, scroll, viewport
resize, reduced motion and image/plain backdrops. Tab and Shift+Tab are checked
both from a focused row and after Escape restores trigger focus. An 80-frame
check verifies that navbar clipping and shadow geometry stay aligned, then
checks that idle and removed components stop drawing.

The existing combined Surface/component suite passed 1,486 assertions at 1280 px
and 390 px, including reduced motion. Desktop comparison captures were exact. Phone captures
retained the suite's accepted rasterization differences, so phone pixel identity
is not claimed.

Native macOS WKWebView checks covered desktop menu opening, Escape followed by
immediate reopening, switching menus, and Tab/Shift+Tab from a focused row.
The rendered menu was inspected. This is native WebKit behavior coverage, not a
Safari FPS benchmark or proof of image identity across all frames. Firefox,
physical iPhone and live deployment were not tested in this integration pass.
