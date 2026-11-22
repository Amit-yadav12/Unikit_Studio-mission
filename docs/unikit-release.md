# Unikit Studio — release verification

## Delivery provenance

The named public repository was inspected at `03293f39d73fd0f7d6ef1395c1364ecd6edbe818`. That revision already contains the browser-first Vite app and a Vercel API adapter. Its pre-existing logo was a blue block-U, not the supplied circuit mark. The release branch `unikit-circuit-studio` (`f66824d`) is a local commit on that exact upstream base. The portable `public/releases/unikit-studio-github.patch.gz` includes binary design assets, the working comparison, theme, tools and tests. `git apply --check --binary` passed against a separate clean checkout of the base revision.

The managed preview is a separate Next.js/Drizzle checkout. It preserves its existing workspace, settings, history, document auditor and versioned REST API. No remote GitHub push, Vercel deployment, or production database migration was performed.

## Actual verification

- Preview: Node 22.23.4, Next.js 16.4.6, Sharp 0.35.5. Route type generation, strict TypeScript, ESLint and production build all completed successfully. Platform startup and health check passed. `npm audit --omit=dev` reported no production dependency advisories at the time of this run; that is not a security guarantee for future versions.
- **105 API regression checks** passed against a running production build. This includes actual image encoding, animated images, partial failure, actual accounting, downloadable results, CSS analysis/patches, session isolation, history and a real public document audit.
- **9 additional privacy and byte-integrity checks** passed: temporary TIFF conversion creates no job or artifact; its delivered WebP decodes and has exactly the reported size. A small no-regression source was retained without an archived original. Larger TIFF output produced negative measured savings. Unchanged CSS was not archived.
- **18 existing access-control/validation probes** and **112 structural accessibility checks** passed. These are not a claim of complete security or WCAG conformance.
- **61 browser checks**, Chromium 141.0.7390.37: verified fresh dark appearance, persistent light choice, following live system changes, reduced motion, keyboard comparison, batch JPEG/transparent PNG conversion, matching single/ZIP bytes, real AVIF encode and decode, GIF input to JPEG, TIFF/GIF conversion using Extended codecs, unsupported-file rejection, CSS patch/download, local asset inspection and in-memory handoff, history refresh, and mobile drawer dismissal. Checked all eight screens at 360, 390, 768 and 1366 pixels for document-level overflow. The on-device two-file run sent only a small JSON measurement receipt; source bytes were not in any request. No script/console errors or failed HTTP responses were observed in this run.
- **Public GitHub checkout: all ten suites ran and passed**, including 181 actual browser checks. Suite counts: core 160, image pipeline 83, result model 43, DOM workflow 75, audit 26, API 62, security 57, function adapter 23, accessibility 35, browser 181. Typecheck and Vite production build passed. ESLint completed with two existing React Fast Refresh export warnings and no errors.

## Measurement example

The public alpine sample is an illustration photograph, not user data. Its displayed metrics come from two real assets. The supplied JPEG weighs 362,384 bytes and the WebP weighs 88,688 bytes: **273,696 bytes saved, 75.5% reduction**, 1500 × 750 before and after. Nothing here claims visitor numbers, Core Web Vitals gains, or guaranteed compression ratios.

## Scope and remaining manual work

Use the managed preview through the platform UI. Its public hostname requires the platform's traffic-access header: unauthenticated external requests returned gateway 403, while the app's local readiness endpoint and managed healthcheck returned 200. No gate was disabled or bypassed.

To publish the GitHub edition, apply the supplied patch, review it, push your branch, and import the nested Vite project into Vercel following `docs/deployment.md`. Test the resulting Vercel preview before promoting it. The hosted Vite audit, deployment credentials and Safari/Firefox-specific codecs were not independently verified on a production Vercel host. TIFF on the browser-only GitHub edition requires browser decoder support; the Next preview additionally supplies an explicit temporary Sharp engine for TIFF and animation.

No general-purpose PDF, video, audio or binary font compression was added. A private file is never negotiated into a server upload automatically. Neither the public demo nor a successful build is used as evidence of a live production deployment.
