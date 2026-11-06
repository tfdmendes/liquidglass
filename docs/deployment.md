# Publish the static site

Our dependency-free Node.js build creates the complete public website in `dist/`.
It preserves relative URLs, so the home page, API documentation and ES modules
work under the GitHub Pages project prefix `/liquidglass/`.

Use Node.js 22 and a normal Git clone with full history. The comparison builder
reads retained engine revisions `862e553` and `938df92` from Git. A shallow clone
without those commits cannot build the comparison. No package installation is
needed.

Before replacing `dist/`, the builder checks the three current library files
against the saved benchmark hashes and verifies that the raster and animation
reports describe the same current and previous core builds. A stale report
stops publication before the existing output is touched. Refresh the measured
evidence when changing the library; rebuilding this website does not run a benchmark.

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
HTML, SVG and JSON performance documentation. It generates `showcase/` using
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

## GitHub Pages workflow

`.github/workflows/pages.yml` builds and deploys on pushes to
`feat/liquidglass-showcase`, and supports manual dispatch once GitHub exposes
the workflow for the repository. The initial branch push is the automatic
publication trigger. Configure the repository's Pages source as **GitHub
Actions** before relying on this workflow. The `github-pages` environment must
allow deployment from this feature branch. Repository settings and environment
protection can require an administrator or a separate approval.
Publication uses the dedicated feature branch directly and does not require
merging it into the default `main` branch.

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
release, dispatch it for a branch containing that source revision. Generated
`dist/` is not committed. Changing the publishing branch requires updating the
workflow trigger and the environment's deployment branch policy together.
