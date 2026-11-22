# Unikit Studio — release verification status

Updated: 2026-11-22 (UTC)

## Status: code checks pass; deployment and browser sign-off are blocked

The Vite application now lives directly in `optiweb-studio-mern-vercel/`, the
requested Vercel Root Directory. The outer repository still contains a separate
Next.js application; the Vite deployment configuration is isolated in this
folder. The application is not being declared production-ready yet: no Vercel
Preview could be created or inspected, and the real-browser suites could not
start in this sandbox.

## Completed here

- `npm ci`: passed on Node 22.
- `npm run typecheck`: passed.
- `npm run lint`: passed with no warnings after separating UI utilities/hooks
  from component modules.
- `npm run build`: passed. Output is `dist/`; CSS is about 58 KB; image and ZIP
  workers and AVIF/WebP WebAssembly codecs are emitted as same-origin assets.
- `npm test`: all nine runnable suites passed (567 assertions across unit,
  pipeline, UI model, optimizer DOM, audit, API, security/privacy, Netlify
  function and accessibility). The browser and release suites were skipped by
  the default runner because no usable browser was available.
- `npm test -- --browser`: the same nine suites passed; the two browser suites
  failed before running assertions because Chromium cannot load the host's
  missing `libnspr4.so` (and `libnss3.so` is also unavailable).
- `npm audit`: zero vulnerabilities after updating the lockfile; a clean `npm
  ci` continued to report zero. `npm audit --omit=dev`: zero vulnerabilities.
- Local production smoke test:
  `npm run smoke -- http://127.0.0.1:5000 --expect-build --wait 600` — 30/30
  passed. This checked the served build, deep link, security headers, no
  cookies, asset 404 behavior, worker, AVIF/WebP MIME delivery, API health,
  upload refusals and SSRF refusals. It is not a deployed-host smoke test.
- All workspace addresses (`/app`, images, fonts, assets, audit, settings,
  retired history/storage paths and `/404`) returned the app shell on the local
  production server.
- The security suite passed checks for same-origin-only application requests,
  the single JSON Website Audit request, no upload/file storage routes,
  matching security headers, and the SSRF address filter.

The checked-in self-test fixtures were missing from this branch despite the
fixture README and test references. Valid JPEG, PNG, WebP, AVIF, GIF and TIFF
test files have been restored so the automated suites run from a clean checkout.
Missing social-card and app-icon PNGs were also generated from the supplied
circuit-U vector, preserving its blue-violet colors.

## Remaining before release

1. **Vercel Preview.** The Vercel connector returned no matching projects, and
   its team listing was denied for insufficient permission. Therefore no
   project settings, build logs, runtime logs or Preview URL could be inspected
   or deployed from this session. Grant the Vercel connection access to the
   existing Unikit project (or reconnect with the correct team/project scope),
   then set Root Directory to `optiweb-studio-mern-vercel`, Node 22.x, install
   `npm ci`, build `npm run build`, output `dist`, and API entry `api/index.ts`.
   Deploy Preview, inspect it, and run the required smoke command against its
   actual URL before any Production promotion.
2. **Real browser suites.** Install/provide Chrome or Chromium with the
   `libnspr4` and `libnss3` runtime libraries available, set `CHROME_PATH`, and
   rerun `npm test -- --browser` and `npm run test:release`. This is needed to
   verify actual image encoders, AVIF/WebP WebAssembly execution, ZIP integrity
   and cancellation, browser downloads, observed Network requests and mobile
   rendering. Those claims are not inferred from the passing DOM/security
   suites.
3. **Live deployed verification.** Once the Preview exists, run
   `npm run smoke -- https://<actual-preview-host> --expect-build --wait 600`.
   Verify `/api/health`, `/api/v1/health`, `/api/v1/audits`, all deep links,
   actual JS/CSS/worker/WASM delivery, browser console and Network panel. Do
   not promote to Production until these checks pass.

No Production deployment or Preview result is claimed in this report.
