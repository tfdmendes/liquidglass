# Comparison website design record

The selected direction is **One motif**, seed **825332519**, with no redraws.
It retains the project's system sans-serif type and blue, white and dark-ink
palette. The darker existing blue is used for readable white button text.

On this page, Liquid Glass's mirrored capsule lens becomes the window through
which both engine revisions are inspected. The live interaction is comparing
those outputs and measuring their animation cadence with the same workload.

The subject's material is specific: SVG displacement of an element's own
pixels, R/G displacement and blue rim channels, rounded lens symmetry, optical
curvature and IOR, neutral RGBA pixels, 48-entry map caching, WebKit refresh
workarounds, a shared SVG/WebGL map generator, retained previous source and
exact raw-pixel comparisons. The site shows this working output rather than
an illustration of software.

The page's argument is: inspect the same lens in both builds; run an isolated
comparison; read measured medians and ranges; inspect how the measurement was
made. The hero asks the visitor to measure FPS. Controls, method and source
hashes support that action. No customer claims or performance scores are
invented.

The four image options are existing repository demo assets: city, beach,
colourful particles and a figure in a blue landscape. Their source paths and
copyright limits are recorded in README.md; the footer preserves the ownership
notice. No new stock imagery or generated illustration was used.

## Render review

The final headless inspector checked 1440, 768 and 390 px. All headings fit in
two lines, running text is 16 px, and five computed type sizes carry the desktop
page. It found no horizontal overflow, broken images or low-contrast text.
The fold and page-sheet captures at all three widths were opened and inspected.

The first review identified a clipped phone results table, a narrow mobile
action, an empty chart area and low button contrast. The phone table now uses
labeled pairs, the action uses the complete form width, charts appear only
after a completed run, and white button text uses the darker blue. Source
image names and alt text were corrected after inspecting the actual pictures.

The final composition has one focal comparison, consistent shared edges and
clear type hierarchy. The desktop comparison uses wide capsule windows; the
phone uses tall windows and stacked result groups. The measured results remain
readable separately from the empty device-run state. There are no collisions
or accidental clipping in the reviewed captures.

Self-review scores, not a user study: design **8/10**, usability **8.5/10**,
creativity **8/10**, content **9/10**. The weighted score is **8.25/10**. Dense
recorded results make the phone page long; each group retains its scene and
four measurements instead of hiding results behind horizontal scrolling.

The inspector retained two warnings. It cannot count the live lens movement
inside the iframes as video footage; the actual interactive render is better
evidence for this page than a prerecorded clip and avoids extra video decoding.
The eight parent-page entrances are deliberately restrained. Extra decorative
motion would add work around an FPS experiment. All decorative motion and
live previews stop during measurement; reduced motion leaves previews paused.

The final-source browser tests also exercised a completed six-trial comparison,
JSON download, cancellation, delayed preview loading, real resize and scroll
invalidation, synthetic hidden-tab invalidation and phone scene centering.
Viewport emulation is not a physical-phone test. No live deployment was made.
