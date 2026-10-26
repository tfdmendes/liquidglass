# Combined rendering validation

Recorded on 2026-10-26 against upstream `068ad226f53e1ca62d857f78bdc32f58f3c5fce7` and working-tree library files at `21f0845f8a4894b11b7d8e40ed37b796f95bddda`. The [standalone comparison](combined.html) embeds the actual upstream core/components and actual current core/components. It reuses the Surface scene without changing the four isolated review pages. Full upstream/current hashes, counts and capture differences are retained in [combined-results.json](combined-results.json).

| Current source | SHA-256 |
| --- | --- |
| `lib/liquid-glass.js` | `18061e61f24102bf8b1c336689ec78bc8eccc2bbd8621da305eeb48e1e61e40f` |
| `lib/components.js` | `56ccca6f02d5f57a1129e9c977ac06699cbdb30b7cd1f92f632fd95406117545` |
| `lib/glass-webgl.js` | `17c5d8123aee314ebc87de1fee2c469b7177d0603f7f5e2d89185e6cee09eb6b` |

- Chrome 156: **1,486 assertions passed**. Firefox 157 / Gecko: **1,495 passed**. Each ran 1280×800 at DPR 1, 390×844 at DPR 2, and 390×844 at DPR 2 with reduced motion. Checks cover exact map reuse with stable filter IDs, graph rebuild/hide/show, pending decode ordering/destruction, real mouse press and spring motion, document/nested/source-only scroll, real 110 px image layout shift, late image source, reconnect, rapid press/cancel, idle and queued-frame teardown. No page errors were recorded.
- The six-position, 32-extra-surface replay reduced geometry reads from **1,230 to 679/680** in Chrome and **1,226 to 679/676** in Gecko (desktop/phone). Candidate unrelated-scroll and idle reads were zero. These are operation counts, not CPU benchmarks.
- Four focused map outputs per configuration were byte-exact. All **nine Gecko DOM pairs** and the three Chrome desktop pairs were pixel-exact. Chrome phone cross-captures changed **96–447 of 1,316,640 pixels**. At most one pixel exceeded channel delta 1: physical `(568, 1158)`, delta 165, also present in unchanged self-repeats. Chrome phone captures are not claimed to be pixel-identical.
- Two bounded, top-level **macOS WKWebView** checks compared upstream/current at 390×844, native DPR 2, with three extra sparse surfaces. Both retained WebKit filter refresh and passed press/cancel, scroll alignment and the real image layout shift. The final deformation captures were pixel-exact. Native pointer events were dispatched in JavaScript; the system motion setting was used.
- Separate current-core/current-renderer WebGL quick runs passed **164 Chrome + 163 Gecko assertions**, with **82/82 exact readback samples**. Their raw JSON was read back and summarized in the retained results. This combined page itself covers core/components.

Run from the repository root with `PLAYWRIGHT_MODULE` pointing to the existing Playwright `index.mjs`, `FIREFOX_EXECUTABLE` pointing to the isolated Firefox launcher, and `SNAP_WEBKIT` pointing to the existing compiled `review/snap-surface-scroll.swift` helper. Firefox uses the standard Firefox 157 UA and asserts production Gecko detection. `CHROME_EXECUTABLE` optionally overrides system Chrome. No packages or browsers are installed.

```sh
node review/combined-fixture.mjs
node tests/combined-integration.mjs chromium
node tests/combined-integration.mjs firefox
node tests/combined-native.mjs
```

The builder writes `review/combined.html`. Runs write transient PNG/JSON/log files to `/tmp/liquidglass-fork-validation/combined`, overridable with `COMBINED_EVIDENCE_DIR`. Leave the isolated scroll builder's `EVIDENCE_DIR` unset. The native runner opens exactly two temporary WKWebView windows and serves embedded fixtures over a temporary loopback port.

Coverage does not establish physical iPhone behaviour, stock Firefox/Safari application behaviour, real background-tab suspension, or combined CPU performance. Earlier isolated CPU measurements remain separate evidence. Existing isolated suites cover the wider edge-case matrices; the direct map/filter suites and WebGL quick checks were also rerun against the current library.
