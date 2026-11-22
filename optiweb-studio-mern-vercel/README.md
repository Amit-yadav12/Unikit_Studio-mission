# Unikit Studio

Web and document tools that run in your browser. Images and documents are
converted locally, stylesheets are patched and asset files are inspected by the
page itself: selected files are never uploaded.

| Tool | What it does | Where it runs |
| --- | --- | --- |
| Image Optimizer | Re-encodes images to WebP, AVIF, JPEG or PNG, caps dimensions, reports real output sizes, builds a ZIP | Your browser (a Web Worker of the tab) |
| PDF & PowerPoint Studio | Compresses and converts PDF and modern PPTX documents, checks real output sizes and creates local downloads | Your browser tab (memory only) |
| Font Optimizer | Finds `@font-face` rules without `font-display`, shows the exact change, gives the patched stylesheet | Your browser |
| Asset Analyzer | Reads format, dimensions, weight and metadata from file headers | Your browser |
| Website Audit | Fetches a public page and reports the resources it names | The server: a browser may not read another site's pages |

Earlier versions uploaded images to a server and stored results. Normal file
processing now requires neither MongoDB nor blob storage. Files, names,
processing statistics and savings stay in live tab memory only. Theme and
non-processing preferences may remain in localStorage; stylesheet drafts are
never stored.

## Brand and interactive preview

The transparent circuit-U trace is in `public/brand/unikit-symbol.svg`. All icons and the social card use the same geometry. The original blue-violet circuit mark is preserved. Deep navy and electric blue define the interface, with buttery yellow (#FFF8AA) for actions, selected cards and important metrics. Light and System themes remain available. The landing comparison uses the actual JPEG and WebP in `public/samples/`, with their measured byte counts in `src/generated/sample.json`.

For Vercel, import the repository and select `optiweb-studio-mern-vercel/` as the Root Directory. Keep the repository's Vite preset, `npm run build`, `dist/`, and API rewrites. No database or blob storage is needed for the on-device tools. Configure an optional PageSpeed key only server-side. Create a preview deployment and verify `/api/health`, the URL audit, the worker and the local AVIF codec before promotion.

## How a file is handled

1. You choose or drop a file. The page reads its first bytes and identifies it
   from them, not from its name: format, dimensions, animation, metadata.
2. The size check happens before anything is decoded. An image that would need
   more memory than the device can spare is refused from its header.
3. A Web Worker decodes the image, applies the EXIF rotation, resizes it if a
   limit is set, and encodes it. WebP, JPEG and PNG come from the browser's own
   encoder. AVIF comes from a WebAssembly encoder that this site serves and the
   page loads the first time AVIF is needed (3.3 MB, about 1 MB compressed in
   transit).
4. The result stays in the tab's memory. Downloads and the ZIP are made there.
   Leaving the page discards everything.

No request carries a file, a file name, a processing statistic or savings data. This is not a promise about
how the server treats uploads: the server has no endpoint that accepts one. The browser test also checks that processing creates no localStorage, sessionStorage, IndexedDB or Cache API records.

### What makes that checkable

- **The server cannot take a file.** It has two routes: a health check and
  `POST /api/v1/audits`, which reads a JSON body of at most 16 KB. There is no
  multipart parser, no database driver and no storage client in the
  dependencies. See [docs/api.md](docs/api.md).
- **The browser is told to refuse.** Every page is served with a
  Content-Security-Policy whose `connect-src`, `form-action` and `default-src`
  are `'self'`. A script on the page cannot send data to another origin.
- **A test watches the wire.** `npm run test:browser` drives the production
  build in a real Chrome, with every request of the app passing through a
  recording proxy. It optimizes images and asserts that no request carried a
  body, a file name or image bytes, and that none went to another host. It
  repeats the work with the network cut off. At the end it checks itself: a
  page that does post to another host is recorded, body included.

You can check it yourself: open the browser's developer tools on the Network
tab and optimize an image.

## Image Optimizer in detail

- **Reads** JPEG, PNG, WebP, AVIF, GIF and BMP. A file the browser cannot decode
  (TIFF and HEIC in Chrome) is reported as such, with a hint.
- **Writes** WebP, AVIF, JPEG, PNG.
- **Strategies**
  - *Single*: write the chosen format. If the result is larger than the
    original, the row says so and "Keep original" is offered for that file.
  - *Best-effort*: encode each file as WebP, AVIF and (when it has no
    transparency) JPEG, and keep the smallest of them.
  - *No-regression*: as best-effort, but when no result is smaller than the
    original, the original file is kept unchanged. A result is never larger.
- **Quality** 30 to 100. **Maximum width and height** 16 to 16,000 px.
  Proportions are kept and an image is never enlarged.
- **Exact application targets** (not guarantees about a device or host):
  - 5 MB per image; 5 images per batch; 20 MB aggregate input;
  - 24 MP decoded pixels per image, checked from the header before decoding;
  - one image processed at a time, even on multi-core devices;
  - 500 KB of CSS per input, measured as UTF-8 bytes;
  - 5 files per Asset Analyzer batch;
  - 50 MB per generated ZIP, with a separate browser-memory budget.
- **ZIPs** are created by a disposable worker with actual progress. Every entry
  is reopened and checked against its source with SHA-256 before download.
  Cancellation terminates the worker. Source names, output extensions and
  duplicate-name suffixes are preserved. Object URLs are revoked after use.
- **Cancel** stops the batch at once by terminating the workers, which is what
  frees their memory. Finished files keep their results.

What the conversion does to a file, so there are no surprises:

- Outputs are 8-bit sRGB. Wide-gamut and high-bit-depth sources are converted.
- Outputs carry no metadata: no EXIF, no GPS position, no colour profile. The
  EXIF rotation is applied to the pixels first, so the image still looks right.
- Animated images (GIF, APNG, animated WebP and AVIF) and SVG are refused
  rather than flattened to one frame.
- JPEG has no transparency: transparent areas become white.

## PDF & PowerPoint Studio

The Documents section processes one PDF or `.pptx` at a time in browser memory. Individual document inputs are capped at 15 MB. It does not support legacy `.ppt`, encrypted PDFs, macro-enabled PowerPoint packages, split/ZIP64 PPTX archives, or password-protected content. The documents code has separate archive, entry-count, expanded-size, media-size, page-count, slide-count and pixel limits: 4,000 ZIP entries; 32 MB per expanded entry; 128 MB expanded total; 96 MB expanded media; 200:1 maximum expansion for entries larger than 1 MB; and 50 MB maximum generated archives. Raster work is capped at 12 MP per rendered page and 100 MP total. These limits do not change the Image Optimizer's independent 50 MB ZIP limit.

- **PDF compression:** Lossless mode rewrites the PDF structure and keeps the input unchanged if the saved PDF is not strictly smaller or the rewrite fails. Balanced mode rasterizes pages to JPEG; this can remove searchable text, vectors, form fields, accessibility structure and metadata. Its original is kept if the output does not save bytes.
- **PDF pages to images:** Renders each page in order as PNG or JPEG and downloads the set as a local ZIP. The browser enforces a page/pixel cap.
- **Images to PDF:** Combines 1–20 signature-checked PNG/JPEG images, with a 15 MB aggregate input limit, 24 MP per image and 80 MP total, into a PDF.
- **PDF to PowerPoint:** Each PDF page becomes a full-slide raster image. This is explicitly a visual deck, not editable text or PowerPoint objects.
- **PowerPoint optimization:** Re-encodes only supported embedded PNG/JPEG raster images when the replacement is smaller. Other package content is preserved; if the final PPTX is not strictly smaller, the original package is kept. Digital-signature packages are refused because any package edit would invalidate the signature.
- **PowerPoint to PDF:** Uses a browser-compatible PPTX importer and renderer (not a slide-generation library), then captures the rendered slides as static PDF pages in source order. External relationships are blocked. Renderer limitations can affect fonts, tables, charts, SmartArt, 3D effects and embedded objects; the output includes notices and should be reviewed. Animation, transitions, linked media and interactive content are not exported.

Input signatures, file extensions and MIME types are cross-checked. PPTX ZIP central/local metadata, entry paths, duplicates, CRCs, XML parts and internal relationships are checked before use. XML entities/DOCTYPEs, path traversal, symbolic links, encrypted/split/ZIP64 packages and excessive archive expansion are refused. Macros are never executed. Rendering uses explicit page, slide and pixel budgets; workers, renderer resources, temporary buffers and download object URLs are cleaned up. Outputs and file names are never sent to an API, placed in browser storage, or retained as history.

The `documents` suite exercises document limits and signatures, package/relationship checks, macro/path rejection and generated visual-slide package structure. It does not replace validation in Chrome/Edge/Firefox or review of representative real PDFs and PPTX files.

## Run it locally

Requires Node 22.

```bash
npm ci
npm run dev        # the app on http://localhost:5173, the API on :5000
```

Production build and server:

```bash
npm run build      # typecheck, then build the app into dist/
npm start          # serves dist/ and the API on PORT (default 5000)
```

No environment variable is required. [.env.example](.env.example) lists the
optional ones: a PageSpeed Insights key and the limits of the website audit.

## Tests

```bash
npm test                 # every suite; the browser suite if a browser is found
npm test -- --browser    # fail, instead of skip, when no browser is found
npm test -- unit api     # only the named suites
```

| Suite | Command | What it checks |
| --- | --- | --- |
| unit | `npm run test:unit` | Image header parser against real files, checks before decoding, planner, CSS and asset analysis, settings |
| pipeline | `npm run test:pipeline` | The steps of the image pipeline and the engine's scheduling, cancelling and fallback |
| ui | `npm run test:ui` | The result model: sizes, savings, kept originals, totals |
| documents | `npm run test:documents` | Document size/signature checks, archive expansion guards, OOXML validation and generated visual slides |
| dom | `npm run test:dom` | The Image Optimizer screen in a simulated DOM, including ZIP size and memory caps |
| audit | `npm run test:audit` | The website audit and its limits against a made-up site, with no network |
| api | `npm run test:api` | The HTTP contract: what is answered, what is refused, no cookies, no upload |
| security | `npm run test:security` | Source, dependencies, headers and the build: nothing that could send, receive or keep a file |
| function | `npm run test:function` | The Netlify function adapter |
| a11y | `npm run test:a11y` | Every page rendered: headings, tab titles, landmarks, names, labels; colour contrast of the tokens |
| release | `npm run test:release` | Exact capacity, ZIP cancellation and verification, no-storage/network proof, CSS 500 KB, analyzer batch size, mobile layouts |
| browser | `npm run test:browser` | The production build in a real Chrome: files never leave the tab; real outputs, sizes, rotation, limits, cancel |

The browser suite needs Chrome or Chromium. It looks for `CHROME_PATH`, then an
installed browser, then the `@sparticuz/chromium` package
(`npm install --no-save @sparticuz/chromium` brings its own). Set
`UNIKIT_TEST_DEVICE="cores=4,memory=8"` to run it as a device of that size.

CI runs it in Chrome's headless shell: the same engine as Chrome, published by
the Chrome team for testing, without the browser around it. To use it too:

```bash
npx @puppeteer/browsers install chrome-headless-shell@stable   # prints the path
CHROME_PATH=<that path> npm run test:browser
```

The reason is what the suite asserts. A full Google Chrome calls Google's
services on its own account, whatever page is open. The suite keeps those calls
apart from the app's: the app runs in a browser context with its own proxy,
and three services that work inside every context (autofill lookups, a
connection kept open to the search engine, an "AI Mode" availability check) are
switched off. With that, the suite passes in a full Chrome as well. Should a
later Chrome add another such service, the run fails and prints what Chrome's
own network log says about the request; the headless shell has no such
services and is not affected.

`npm run smoke -- <url>` checks a running site through public requests:
see [docs/deployment.md](docs/deployment.md). CI runs it against the started
server, against the Netlify deploy previews of a pull request, and against
production on `main`.

## Deployment

The app is a static site plus one small function. It is configured for Vercel
(`vercel.json`), Netlify (`netlify.toml`) and any Node host (`npm start`).
There is nothing to provision: no database, no storage, no secret.
[docs/deployment.md](docs/deployment.md) has the details and the checks to run
after a deploy.

## Project layout

```
api/index.ts                 Vercel function entry
netlify/functions/api.ts     Netlify function entry
src/index.ts                 Node server entry (npm start)
src/app.ts                   The whole server: health, audit, refusals, static files
src/server/                  Audit service, address filter (SSRF), rate limit, headers
src/shared/                  Code used by both sides: image headers, CSS, asset analysis
src/features/images/engine/  Inspect, plan, pipeline, worker, engine
src/features/                The four tools and Settings
src/components/, src/lib/    Interface parts and helpers
public/                      Icons, manifest, theme script
scripts/                     Self-tests, fixtures, smoke test
docs/                        API, deployment, design tokens
```

## What changed in 2.0

- Image conversion, stylesheet patching and asset analysis moved from the
  server into the browser. The server-side image library, the database, object
  storage, sessions, cookies, quotas, background jobs and the scheduled cleanup
  were removed, with their endpoints. Old endpoints answer `410 Gone`.
- AVIF output is always available, through a WebAssembly encoder.
- History and Storage pages are gone: nothing is kept, so there is nothing to
  list. Their addresses explain this instead of failing.
- The product was renamed to Unikit Studio. The repository, the app directory
  and the hosting projects keep their earlier names, because the hosts are
  configured with them.
- Settings moved from the server to the browser's `localStorage`.

## Known limits

- Encoding speed and the largest image depend on the visitor's device.
- Chrome is the tested browser: Chrome's headless shell, Google Chrome and
  Chromium, all automated. Edge has the same engine but was not run. Firefox
  and Safari use the same code paths, with the WebAssembly WebP encoder where
  their canvas cannot write WebP; no automated test runs in them.
- The website audit reads HTML and the resources it names. It does not run the
  page's JavaScript.
