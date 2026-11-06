# Liquid Glass comparison

Compare the previous delivered engine with our latest engine, inspect the same
lens at rest, and measure animation cadence on your device. The optional
original build is our integrated fork at `862e553`, before either raster pass.

From the repository root:

```sh
# Generate the standalone site from source and Git history
node scripts/build-showcase.mjs

# Start a loopback-only server without opening a browser
node scripts/serve-showcase.mjs --port 4173
```

Open `http://127.0.0.1:4173/` manually. `--port` changes the listening port.
Ctrl+C stops the local server. These commands do not install packages, contact
a hosted site or deploy changes. The build recreates the ignored `showcase/dist/`
directory. The server also builds it before serving. There is no automatic reload
or browser opening.

The site runs without a package manager or backend. Modules and `fetch` need
HTTP; opening `index.html` directly from the filesystem is not supported.
The generated `showcase/dist/` directory can be served independently after
building. Building requires a normal clone with the relevant Git history.

Live preview FPS shares page resources and is illustrative. The benchmark
disposes preview renderers, warms and measures one build at a time, alternates
three trials per build, and reports medians and ranges. Hiding the tab, scrolling
the scene out of view or resizing invalidates the comparison. Explicit cancellation discards partial
results. A paused preview resets both lenses to identical geometry.

FPS measures requestAnimationFrame cadence, not physical presentation.
Synchronous update time excludes asynchronous decoding and GPU completion.
The recorded headless report is labeled separately from your device results.
See [the full performance notes](../docs/performance/fps.md).

Within `dist/`, `builds/previous/` comes from `lib/` in the first-pass source
commit `938df92e98d935c5fc61c3c7e0953a216bf831ce`, `builds/current/` is generated
from `lib/`, and `builds/original/` comes from Git revision `862e553`.
`builds/manifest.json` records SHA-256 hashes for every module. The generated
site includes the source's MIT license.

The four images are copied from the repository's existing demo wallpapers:
`images/city-1200.jpg`, `images/beach-1200.jpg`, `images/wave.jpg` and
`images/portrait-1200.jpg`. They belong to their respective owners and are not
covered by the engine's MIT license. No new stock imagery was downloaded.
