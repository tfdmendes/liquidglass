# Publish the static site

Our dependency-free Node.js build creates the complete public website in `dist/`.
It preserves relative URLs, so the home page, API documentation and ES modules
work under the GitHub Pages project prefix `/liquidglass/`.

Use Node.js 22 and a normal Git clone with full history. The comparison builder
reads retained engine revisions `862e553` and `938df92` from Git. A shallow clone
without those commits cannot build the comparison. No package installation is
needed.

Before replacing `dist/`, the builder checks the current core and WebGL files
against the 12 November animation report. Those scenes import the engines
directly and do not measure the UI components. It verifies the five workloads
and paired trial counts, then checks the historical raster report against its
own Git snapshots. The two reports use different baselines and keep separate
labels. Stale engine evidence stops publication before the existing output is
touched. Refresh the measured evidence when changing an engine; rebuilding
this website does not run a benchmark.

From the repository root, this command replaces the local generated `dist/`
directory. Source files and hosted services are unaffected. Delete `dist/` to
remove the generated output, or run the command again to rebuild it.

```sh
# Copy the public site and generate the retained engine comparison
node scripts/build-site.mjs
```

To preview the same project prefix locally, start the loopback-only HTTP server.
`--port` sets its listening port. It rebuilds `dist/` before serving and does not
open a browser, install software, or publish anything. Stop it with Ctrl+C.

```sh
# Rebuild and serve the public artifact only on this computer
node scripts/serve-site.mjs --port 4173
```

Open <http://127.0.0.1:4173/liquidglass/>. The API documentation is at `docs/`
and the retained engine comparison is at `showcase/`, relative to that URL.
Use HTTP rather than opening files directly because ES modules and the
comparison's JSON requests require it. This server is a local preview, not a
production server.

## Public artifact

The build copies `index.html`, `robots.txt`, `sitemap.xml`, JavaScript modules
from `lib/`, browser assets from `assets/` (including branding, backgrounds,
fonts and the explicit `assets/fonts/OFL.txt` font license), and demo images from
`images/`. It includes `docs/index.html`, this deployment guide and the Markdown,
HTML, SVG and JSON performance documentation, plus the baseline reconstruction
patch used by the FPS report. It generates `showcase/` using
the existing comparison builder, adds its README and retains its build manifest,
recorded measurements, three engine revisions, media and license. A root
`LICENSE` and empty `.nojekyll` complete the artifact.

Directory copies allow only regular files with public asset extensions, with
the font license copied separately. Hidden files and
symbolic links are excluded. The build does not publish `.github/` artwork
drafts, Git metadata, tests, review fixtures, source-generation scripts,
performance Python dependencies, deployment-server configuration, or `.env`
files. Performance documents retain some links to repository-only source and
design records; those records are not part of the website.

Built pages include content versions in the site CSS and JavaScript URLs. The
main module also versions its benchmark module import, so a deployment cannot
combine cached PNG references with the new WebP assets. The canonical library
files are copied without rewriting, preserving their recorded source hashes.
The main and docs modules also version their component import so the updated
navbar is loaded after publication.

## GitHub Pages workflow

`.github/workflows/pages.yml` builds and deploys on pushes to `main` and
supports manual dispatch. Merging a reviewed change into `main` triggers
publication. Configure the repository's Pages source as **GitHub Actions**
before relying on this workflow. The `github-pages` environment must allow
only the `main` branch, so older workflows on feature branches cannot replace
the published site. Repository settings and environment protection can require
an administrator or a separate approval.

The build job has read-only source and Pages metadata access and uploads only
`dist/` using the official Pages artifact action. The deploy job alone receives `pages: write`
and `id-token: write`. The shared `github-pages` concurrency group serializes
deployments without cancelling one already in progress. There is no package
registry, external build service, custom domain configuration or secret to add.
The job structure follows GitHub's [custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

The workflow's deployment output provides the actual public URL. For a project
repository named `liquidglass`, it normally ends in `/liquidglass/`. After a
successful run, open that URL and check the home page, `docs/`, `showcase/`,
`lib/components.js`, images and fonts. A local build does not establish a
successful deployment or browser compatibility.

To replace the published site, push a reviewed source change to the configured
branch or dispatch the workflow for the intended revision. To restore an earlier
release, restore its matching source, recorded benchmark evidence and build
files on `main`. Keep the current Pages workflow and deployment branch policy.
An engine-only revert can fail the evidence checks. Run `node
scripts/build-site.mjs` successfully before pushing the recovery commit; the
automatic workflow then publishes it from `main`. Generated `dist/` is not
committed. Changing the publishing branch requires updating the workflow
trigger and the environment's deployment branch policy together.
