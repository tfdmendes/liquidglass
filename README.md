# Liquid Glass

Liquid Glass is a JavaScript library that adds glass effects to web interfaces. It uses image distortion, blur and highlights to simulate a view through curved glass. The library provides a rendering engine and web components. The components include buttons, switches, sliders and menus.

The library works with plain HTML and web frameworks. It runs without additional JavaScript libraries.

This project is a fork of [gentpan/liquidglass](https://github.com/gentpan/liquidglass). The original engine and components are by gentpan. This fork reduces repeated rendering work and keeps the original programming interface and visual behavior.

## Use the engine

Copy `lib/liquid-glass.js` into your project. Serve the page through your app's web server so the browser can load the module.

The engine refracts an element's own content and background. Give the element a size and visible content or a background:

```html
<div id="glass" style="width: 320px; height: 180px; background: #b6d0ee;">
  Your content
</div>

<script type="module">
  import { createGlass } from './lib/liquid-glass.js';

  const glass = createGlass(document.getElementById('glass'), {
    fit: true,
    clip: true,
    radius: 24,
    blur: 2,
  });
</script>
```

`fit` tracks the element's size, `clip` rounds its outline, and `radius` and `blur` are in CSS pixels. Change settings with `glass.update({ blur: 4 })`. Call `glass.destroy()` when the element is no longer used to remove its filters and observers.

The [core API reference](docs/index.html#api) covers lens position, size, refraction and other options. For video or canvas, also copy `lib/glass-webgl.js` and import its `createGlassRenderer` factory.

### Web components

For buttons, switches, sliders and other controls, copy `lib/components.js` beside `lib/liquid-glass.js` and load it instead:

```html
<script type="module" src="./lib/components.js"></script>

<lg-button>Continue</lg-button>
<lg-switch checked>Wi-Fi</lg-switch>
<lg-slider value="40" label="Volume"></lg-slider>
```

For glass over a photo, mark the image as its backdrop:

```html
<div data-lg-backdrop="img">
  <img src="photo.jpg" alt="">
  <lg-button>Continue</lg-button>
</div>
```

The [component reference](docs/index.html) covers attributes, events and styling.

`<lg-segmented>` supports press-and-drag selection with continuous label refraction.
The lens grows while held and snaps to an enabled option on release. Click and
keyboard selection remain available; `radius="capsule"` gives it a capsule outline.

## What changed

- **Map reuse:** identical lens pixels share an image instead of being encoded and decoded again. Recent exact shapes also avoid recalculating those pixels.
- **Filter updates:** Chrome and Firefox keep a stable filter between updates. Safari retains the extra refreshes it needs.
- **Scrolling:** only affected glass copies are realigned, with fewer size and position measurements.
- **WebGL:** unchanged static image snapshots (`ImageBitmap`) and paused videos sleep between updates. Canvas and animated images stay live.

## Results

These measurements compare each change separately with upstream revision `068ad22`. The workloads and full results are in [the performance notes](docs/performance/README.md).

![Rendering operations before and after each optimization](docs/performance/operation-counts.svg)

The next chart shows accumulated browser CPU time during an accelerated animation replay. Lower is better. Each case has three samples; the ranges show how much they varied.

![Measured browser CPU time, including sample ranges and the cost of new maps](docs/performance/cpu-time.svg)

Repeated shapes benefited from the cache. When nearly every map was new, median CPU time was about 1–1.5% higher in these samples. These numbers describe the measured workloads, rather than a fixed reduction in CPU use for every page.

## Browser behavior

| Glass placed over | Chrome | Safari / WebKit | Firefox |
| --- | --- | --- | --- |
| A marked image | Refraction | Refraction | Refraction |
| Arbitrary page content | Refraction | Frosted blur | Frosted blur |

Checks cover Chrome, Firefox and native macOS WebKit, including desktop and phone-sized layouts. Physical iPhone behavior has not been tested. See the [performance notes](docs/performance/README.md) for the exact coverage and capture limits.

## Development

The source files live in `lib/`. Their copies in `skill/liquid-glass-web/assets/` must stay in sync:

```sh
sh scripts/sync-skill.sh
```

This copies the three library files into the bundled skill. Browser regression tests live in `tests/`; comparison builders and measurement records live in `review/`. They use Node.js and a separate Playwright installation; neither is required to use the library.

Run segmented-control regression tests with `node --test tests/segmented.test.mjs`.
Set `LG_PLAYWRIGHT_MODULE` to an existing Playwright `index.mjs` when it is installed
outside this repository. `LG_BROWSER=firefox` selects Firefox; use
`LG_FIREFOX_EXECUTABLE` or `LG_CHROME_EXECUTABLE` to select an existing browser binary.
The suite serves a temporary loopback page and closes it after the checks.

See [the combined regression checks](review/combined-validation.md) for reproduction commands and the tested source hashes.

The [side-by-side comparisons](review/README.md) include standalone HTML pages with replay controls, operation counts and coverage limits.

## Credits and license

The original project is [gentpan/liquidglass](https://github.com/gentpan/liquidglass). Its MIT license and copyright notice are preserved in [LICENSE](LICENSE).

The rendering approach was described by Aave Labs in [Building Glass for the Web](https://aave.com/design/building-glass-for-the-web); gentpan wrote an independent implementation. Icons are from [Lucide](https://lucide.dev), under the ISC license. Demo wallpapers in `images/` belong to their respective owners and are not covered by the MIT license.
