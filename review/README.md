# Original and optimized comparisons

The saved HTML pages embed the upstream and optimized code, so they also open without a server. The upstream baseline is `068ad226f53e1ca62d857f78bdc32f58f3c5fce7` from [gentpan/liquidglass](https://github.com/gentpan/liquidglass).

| Page | What it checks |
| --- | --- |
| [Map cache](map-cache.html) | Exact map reuse, press animation, cache limits and decode ordering |
| [Filter updates](filter-refresh.html) | Stable filters in Chrome/Firefox and the retained WebKit workarounds |
| [Scrolling](surface-scroll.html) | Fixed/sticky panels, nested scrolling, late image loads and fewer geometry reads |
| [WebGL](webgl-demand.html) | Source uploads, lens redraws, live canvas/images, paused video and teardown |

These four pages preserve the independently measured candidates. Their saved counts and CPU samples do not describe a fresh benchmark of all four changes combined. The current `lib/` files include every optimization.

[Combined core and components](combined.html) compares the current core and component files together with upstream. It exercises map reuse, filter updates and scrolling in one scene. See [the combined validation record](combined-validation.md) for coverage and reproduction. The WebGL runner can also build a temporary comparison from the current core and renderer; see [its reproduction notes](webgl-demand.md).

Open the [comparison index](index.html) in a browser. The [performance notes](../docs/performance/README.md) explain the charts, source data and coverage limits.

The builders use the working tree as their candidate. Rebuilding a page after changing the library requires fresh measurements before making a new performance claim; the committed measurements remain a record of the original isolated runs.
