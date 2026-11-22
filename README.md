# Unikit Studio

A privacy-first image and web-performance workspace. The supplied circuit-U logo is faithfully redrawn as a transparent SVG, with violet-to-indigo traces and a silver U. The dark default, optional light/system themes, site icons, loading state and social card share that identity.

![Unikit Studio landing page](docs/screenshots/landing.webp)

## Which application is this?

This checkout preserves the existing Next.js App Router application, Node.js route handlers and PostgreSQL/Drizzle history. The [owner's GitHub repository](https://github.com/Amit-yadav12/optiweb-studio-mern-vercel) currently contains a **different, Vite-based version** under `optiweb-studio-mern-vercel/`. We inspected its actual revision `03293f39d73fd0f7d6ef1395c1364ecd6edbe818`, reused its browser header and CSS parsers here, and applied the matching brand changes to a checkout of that revision. Its existing browser-only engine, routes and Vercel configuration remain intact.

**For the named GitHub repository:** [download the tested Git patch](public/releases/unikit-studio-github.patch.gz), or open `/releases/unikit-studio-github.patch.gz` on this preview. From a clean checkout of that repository at the base revision, create a branch and run `gzip -dc /path/to/unikit-studio-github.patch.gz | git am`. Review the diff and push that branch yourself. The patch contains assets as well as source. No external GitHub push or production deployment is claimed.

## Tools

| Tool | Processing and output |
| --- | --- |
| **Image Optimizer** | On-device Web Worker by default. JPEG/PNG/WebP use the browser encoders; AVIF uses a self-hosted, on-demand single-thread WebAssembly encoder. Real batch results, optional max dimensions, quality, single/best-effort/no-regression selection, before/after comparison, individual files and ZIP. |
| **Extended codecs** | Explicit opt-in. Sharp processes one file at a time in memory and streams the produced binary to the tab. Reads/writes JPEG, PNG, WebP, AVIF, GIF and TIFF according to the runtime. Multi-frame inputs are not flattened to a still; WebP and GIF can retain animation. TIFF uses lossless LZW. PNG quality is not presented as lossy quality. |
| **Font Optimizer** | PostCSS analyses and patches eligible `@font-face` rules in the browser. Existing declarations are preserved. Copy/download the actual generated text. This is CSS editing, not font-file compression. |
| **Asset Analyzer** | Reads selected image headers and stylesheets locally. Reports measured size, dimensions and explicit heuristics; passes an eligible file to the optimizer in memory. |
| **Website Audit** | The backend fetches a public URL using bounded requests and validated addresses at socket creation. Initial HTML evidence is not a rendered-browser measurement. Optional PageSpeed/CrUX data is labelled separately. |
| **Overview, history, settings** | The preview stores session-isolated measurement receipts and preferences using Drizzle. A receipt contains no image pixels or stylesheet content. The Vite version keeps its existing on-device settings and activity model. |

### Format boundaries

The browser path also accepts still GIF and BMP where the browser can decode them. Animated sources and TIFF require the explicit Extended codecs choice in this checkout. Browser encoders are tested for actual MIME output, not just support declarations. Local AVIF output is limited to 8 MP (4 MP as a multi-format candidate). There is no silent upload fallback. An unsupported or damaged file gets a per-file failure; successful siblings stay downloadable. PDF, audio, video and binary font compression are **not offered**.

### Privacy and accurate reporting

- UI originals are **never stored by the app server**. On-device mode does not transmit their bytes. Extended codecs uses `delivery=temporary`: input and output are in memory and no binary artifact is written.
- Browser `Blob`/object URLs here are temporary local memory, **not a cloud Blob service**. Downloads remain available in the current workspace tab until the queue is cleared or the page is left. ZIPs are built locally.
- `POST /api/v1/history/local` accepts strictly validated numeric metadata and names, not file contents. Its records are labelled device-reported. History failure does not disable local downloads.
- The original server API is still available to integrations. It can archive **newly generated** artifacts, never retained/byte-identical original images or unchanged CSS. Existing artifacts remain owner-scoped and follow `OW_ARTIFACT_TTL_HOURS`.
- Savings = input bytes − output bytes. Zero or negative savings are shown honestly. For the public demo fixture: 362,384 B JPEG → 88,688 B WebP (273,696 B / **75.5%** saved). This is a comparison of these two files, not a typical or guaranteed result.

## Run this checkout

Use Node 22 LTS and a local PostgreSQL database. Install dependencies (`npm ci --include=optional`), copy `.env.example` to `.env`, set `DATABASE_URL`, then run `npm run db:push` and `npm run dev`. Use a staging database for test runs. No MongoDB, S3 or external storage credentials are required by this checkout.

- `npm run typecheck` — strict TypeScript
- `npm run lint` — ESLint
- `npm run build` — production build, including route splitting
- `npm test -- http://localhost:3000` — live API regression suite against your running test instance
- `npm run test:a11y -- http://localhost:3000` — rendered-markup checks (not a WCAG certification)
- `node scripts/browser-release.mjs http://localhost:3000` — Chromium file conversion, decoded outputs, ZIP integrity, local-only bodies, theme switching and mobile navigation. Requires Playwright and its Chromium browser; `PLAYWRIGHT_MODULE` can point at an isolated Playwright installation's `index.mjs`.
- `node scripts/brand-assets.mjs` — regenerate icons and the measured image pair. Source vector: `public/brand/unikit-symbol.svg`. Example photograph: `design/alpine-source.jpg`. Do not edit the generated measurement JSON by hand.

## Deployment and configuration

See [deployment instructions](docs/deployment.md), [API contract](docs/api.md), `.env.example`, and [release verification](docs/unikit-release.md). All secrets are server-side. Same-origin `/api` routes require no public API key or base-URL secret. The website audit is available without a PageSpeed key; no-key output must not claim real-user metrics.
