# Liquid Glass showcase

## Direction

The product performs. Seed: 1713109039. Albert Sans, a neutral paper ground, navy ink and the existing blue glass-loop mark.

On this page, Liquid Glass's displacement maps become a material you can move and tune with its own controls. The main interaction is a draggable refractive lens over an original optical backdrop. This is the actual SVG engine, not a rendered screenshot.

## Subject and argument

- The selected logo is a transparent blue triangular loop, without text
- The library has eleven custom elements and no runtime dependencies
- Its components render in light DOM and use native input events
- A marked image supplies an aligned backdrop across browser engines
- Arbitrary-page refraction uses a Chromium SVG backdrop filter, with frosted blur elsewhere
- The same map geometry supports SVG and an optional WebGL renderer
- Springs respond to pointer velocity and respect reduced motion
- Segmented controls support keyboard and press-and-drag selection
- Navbar indicators enlarge and refract more strongly while pressed, then follow horizontal dragging
- Current raster measurements show lower map generation costs and byte-identical output
- Recorded animation trials do not establish a general FPS improvement
- The fork retains gentpan's original engine/API and its MIT attribution
- The old scenic demo screenshots and their broad edge highlights were rejected

The opening proves refraction through a movable lens. The material controls expose the real engine settings. The component rows demonstrate input, navigation and feedback at usable sizes. Performance uses the recorded charts with explicit limits. Installation ends with a copyable, working import rather than a sign-up form.

## Copy deck

- Hero: Glass, in motion.
- Introduction: Real refraction. Spring-driven controls. A small JavaScript library for interfaces that feel a little more alive.
- Playground: Make it yours.
- Controls: A familiar feel.
- Navigation: A little direction.
- Feedback: A clear response.
- Performance: Less work. Same pixels.
- Installation: Add a little glass.
- Footer: Made to be touched.

## Material and layout

The site shell is flat. Glass, optical artwork, edge highlights and spring feedback belong inside working product fragments marked `data-ui`. These fragments retain the library's control geometry. Marketing headlines use at most two lines. The page shifts from a large live fragment to three unequal component rows, a measured proof section, and a dark installation field.

The four procedural backdrops are original optical test artwork, not photographs. Their contours and fine texture make displacement visible. There are no customer logos, invented testimonials, fake OS chrome or upstream city screenshots.

The performance section uses native HTML charts inside a light glass panel. A visitor chooses the workload, then compares two absolute values on a zero-based scale. Recorded ranges remain visible. The downloadable figures use light editorial small multiples. The rejected dense dark chart frame and automatic dark-mode graphic have been removed.

The source inspector's remaining warnings are deliberate: this software is demonstrated through real working interfaces and original optical materials rather than stock photographs or an unrelated video. Display, section headings, the measured figure, and the footer wordmark have distinct scales; code and native control text retain their functional sizes.

Default showcase optics use refraction 10px, bezel 0.2, specular strength 0.12 and highlight width 0.75px. These are page-level design choices. Library defaults remain unchanged.

The installation button uses a clearer material: a 22% navy tint, 18px refraction, 0.35 bezel, 0.5px blur and a 1px specular rim at strength 0.4. Its backdrop stays visible through the body, and the copyable example includes the same material settings. This replaces the rejected 85% white tint.

The navigation demo uses a 10% white body tint and a 12% indicator tint, replacing the opaque 80% bar and 60% indicator. Its body uses 20px refraction, a 0.4 bezel, 0.6px blur and a 1px rim at strength 0.4. White labels stay legible over all four backdrops. The central copy also switches to white on Lagoon's blue field. Reduced transparency or increased contrast restores a near-solid light surface and a contrasting selection.

## Interaction and acceptance

The navbar indicator stays on the committed selection during hover and keyboard focus. A primary press lifts and enlarges it and strengthens the refraction of the copied labels. Horizontal dragging follows the pointer across the row with restrained stretch; release springs to the nearest enabled item and emits a selection change. Drag selection does not activate a link. Native clicks and keyboard activation retain their normal actions, while arrow keys, Home and End move the focus outline without moving the indicator. Cancellation restores the committed selection without an event. Body optics and indicator optics are independent. Reduced motion suppresses press enlargement and spring motion.

The lens can be dragged or moved with arrow keys. Material selection, refraction and frost update the actual lens and copyable code. The component examples change visible state, open a menu and show a real toast. All page controls remain usable on a phone. Page content appears immediately, without load or scroll reveals. The glass controls keep their interactive springs and respect reduced motion.

Check desktop, tablet and phone layouts, keyboard use, pointer dragging, navbar press/release and cancellation, native link activation, menu dismissal, toast feedback, code copying, reduced motion and GitHub Pages' project prefix. Capture PNG only; native Chromium JPEG captures have produced stale SVG-filter geometry in this project.

## Assets and publication

The approved logo is `assets/brand/liquid-glass.png`; headers use the smaller `liquid-glass-mark.png`. Albert Sans is self-hosted under the SIL Open Font License in `assets/fonts/OFL.txt`. Procedural artwork is generated as full WebP backdrops and dedicated swatch thumbnails by `scripts/generate-materials.py`. Library credits remain visible in the footer and documentation.

Public URL: https://tfdmendes.github.io/liquidglass/. Build with `node scripts/build-site.mjs`. Only the generated `dist/` tree is published. The source publication branch is `feat/liquidglass-showcase`; publication does not merge it into `main`.
