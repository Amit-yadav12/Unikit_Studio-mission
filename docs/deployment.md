# Unikit Studio deployment

## Named GitHub repository: Vite edition

Apply the binary Git patch in `public/releases/` to the public repository revision documented in the README. It was produced from a real local branch of that repository, not by replacing its application with this preview's framework.

1. Push the reviewed branch to your repository.
2. Import it into Vercel and set **Root Directory** to `optiweb-studio-mern-vercel/`.
3. Keep that directory's existing `vercel.json`: Vite preset, `npm ci`, `npm run build`, publish `dist/`, `/api` routed to its Express adapter before the SPA fallback. Do not use the Next.js config from the parent preview checkout.
4. Select Node 22 LTS. File processing is local, with a worker and static WebAssembly codecs. Do not add a MongoDB/Blob connection for uploaded files. Only Website Audit requires outbound HTTP. `PAGESPEED_API_KEY` is optional and server-side.
5. Make a Vercel Preview first. Verify real image downloads, WebAssembly MIME delivery, deep links, `/api/health` and a permitted public URL audit. Promote only after these checks pass on the target host.

## This running preview: Next.js edition

1. Use this repository's root (the directory containing `next.config.ts`, `package.json` and `vercel.json`). Choose the Next.js preset. Do **not** publish `dist/` or add an `index.html` catch-all: workspace/API routes are real App Router routes.
2. Node 22 LTS, `npm ci --include=optional`, `npm run build`. Fonts, logo, comparison images, worker and AVIF codec are self-hosted. No external font fetch at build time.
3. Provision a reachable PostgreSQL database. Add server-only `DATABASE_URL`, using a separate database for Preview. Run `npm run db:push` against the intended database before serving it. No table reset is required for the rebrand.
4. Configure optional `PAGESPEED_API_KEY`, `SITE_URL` (absolute public origin for social metadata), and the resource limits in `.env.example`. Never put connection strings into `NEXT_PUBLIC_*` or `VITE_*`.
5. Use the narrow capability test `/api/v1/health`: database reachable and Sharp loadable. `/api/v1/limits` exposes enforced codec limits. Test the **two-image** workflow and actual downloads before promoting.

[Official Vercel Function limits](https://vercel.com/docs/functions/limitations): standard buffered requests and responses are limited to **4.5 MB**. Higher request limits can depend on plan, configuration and beta features; this application does not rely on them. On Vercel, the code defaults to a 4 MiB API file/batch budget, plus bounded multipart overhead and a separate output guard. Set `OW_MAX_FILE_MB=1`, `OW_MAX_FILES=4`, `OW_MAX_BATCH_MB=4`, `OW_MAX_ZIP_MB=4` for a conservative starting profile. Check currently applicable duration limits for your project rather than assuming a particular plan's timeout. Browser-side image bytes never traverse a Function.

Private API responses are not publicly cacheable. Only versioned static codec assets use a long immutable cache. Extended conversions do not require durable local files or a background worker. Optional generated legacy API artifacts live in the database; their retention is read from configuration, and expired bytes cannot be downloaded even before opportunistic cleanup. Local receipts have no artifact to expire. The in-process limiter is suitable for a small MVP; use shared rate limiting and runtime network egress controls before a high-volume public rollout.

No Vercel credentials are required to run local tests. A successful local build or managed preview **is not evidence of a Vercel production deployment**.
