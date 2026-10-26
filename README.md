# Liquid Glass

This is a fork of [gentpan/liquidglass](https://github.com/gentpan/liquidglass) with optimizations that reduce repeated rendering work. The original glass engine and web components are by gentpan. This fork keeps their API and appearance, with additional regression tests and side-by-side comparisons.

It provides glass buttons, switches, sliders, menus and lenses for the web. The library has no runtime dependencies and works with plain HTML or a framework.

## Use it

Copy `lib/liquid-glass.js` and `lib/components.js` into your project, keeping them in the same folder. Load your local copy:

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

The [component reference](docs/index.html) covers attributes, events and styling. The optional `lib/glass-webgl.js` renders glass over video or canvas; keep it beside `liquid-glass.js`.

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

Repeated shapes benefited from the cache. When nearly every map was new, the comparison added about 1–1.5% to the median CPU time in these samples. These numbers describe the measured workloads, rather than a fixed reduction in CPU use for every page.

## Run the demo and comparisons

You need Python 3. From the repository root:

```sh
python3 -m http.server 4180 --bind 127.0.0.1
```

`-m http.server` runs Python's built-in HTTP server. `4180` is the local port, and `--bind 127.0.0.1` limits it to this computer. Stop it with `Ctrl+C`.

- [Demo](http://127.0.0.1:4180/)
- [Original versus optimized comparisons](http://127.0.0.1:4180/review/)

The comparison pages also open as standalone HTML files. They include replay controls, operation counts and the tested limits.

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

See [the combined regression checks](review/combined-validation.md) for reproduction commands and the tested source hashes.

## Credits and license

The original project is [gentpan/liquidglass](https://github.com/gentpan/liquidglass). Its MIT license and copyright notice are preserved in [LICENSE](LICENSE).

The rendering approach was described by Aave Labs in [Building Glass for the Web](https://aave.com/design/building-glass-for-the-web); gentpan wrote an independent implementation. Icons are from [Lucide](https://lucide.dev), under the ISC license. Demo wallpapers in `images/` belong to their respective owners and are not covered by the MIT license.
