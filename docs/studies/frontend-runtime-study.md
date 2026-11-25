# Frontend Runtime — Technology Selection Study

**Project:** Net Worth Dashboard
**Status:** Proposed decision | **Date:** 2026-11-25
**Scope:** How the React + TypeScript + Vite single-page application (SPA) is served in production, and how it runs in the local Podman Compose environment. Architecture is out of scope.

## 1. Requirements

**Hard requirements**

- **H1:** Serve Vite's compiled static assets in production (no development server).
- **H2:** Support SPA route fallback, correct MIME types, compressed assets, and cache-control headers (long-lived for hashed assets, no caching for `index.html`).
- **H3:** Serve the API under the same origin (`/api/*`), so authentication cookies work without CORS.
- **H4:** Serve over HTTPS only, with security headers (HSTS, Content-Security-Policy, `X-Content-Type-Options`, `Referrer-Policy`), since the app shows personal financial data.
- **H5:** Be maintained and security-patched; any container runs as a non-root process, with no build toolchain in the runtime image.

**Soft requirements**

- **S1:** Lowest cost at low, irregular traffic (NFR-11).
- **S2:** Production behaviour (routing, headers, `/api/*`) can be tested automatically against the real setup before release (NFR-12).
- **S3:** Low operational effort: no servers or images to patch, no scaling to manage.
- **S4:** Low latency for users.
- **S5:** Simple configuration, defined in AWS CDK alongside the rest of the infrastructure.
- **S6:** One command (`podman compose up`) starts the whole local stack, with hot reload and no Node.js required on the host.

## 2. Options Considered and Hard-Requirement Screening

| Option | Hard requirements | Outcome |
|---|---|---|
| Amazon S3 + CloudFront (no runtime container) | H1–H5; SPA fallback through a CloudFront Function, headers through a response headers policy, `/api/*` as a second origin | Retain |
| Nginx container (unprivileged image) | H1–H5 | Retain |
| FastAPI serving the static files (single container) | H1–H5, with custom code for SPA fallback and cache headers | Retain |
| ~~Caddy, Lighttpd, Apache HTTP Server~~ | Meet H1–H5, but offer no advantage over Nginx | **Not shortlisted** |
| ~~Node.js static server~~ | Meets H1–H5 with an additional runtime and application to maintain | **Not shortlisted** |
| ~~AWS Amplify Hosting~~ | Meets H1–H5, but deploys outside the CDK pipeline and offers no advantage over S3 + CloudFront | **Not shortlisted** |
| ~~Vite dev or preview server~~ | Explicitly not intended as a production server (H1/H5); used for local development only (see §4) | **Exclude** |

## 3. Comparative Assessment (Qualitative)

**Method:** capability and operational assessment, **not a measured load test**. Costs are indicative and must be checked against current AWS pricing for the chosen region.

| Option | S1 Cost | S2 Testable before release | S3 Operations | S4 Latency | S5 Configuration | Assessment |
|---|---|---|---|---|---|---|
| **S3 + CloudFront** | Near zero (within CloudFront's free tier at this traffic) | Yes, on a staging stack built from the same CDK code; near zero when idle | Nothing to patch or scale | Edge-cached worldwide | CDK constructs; SPA fallback needs a small function | **Best overall fit** |
| **Nginx container** | An always-on task (≈ $9/month on the smallest Fargate size), plus a load balancer if not shared with the API | Yes, same image locally and in production | Image patching, task health | Single region, unless placed behind CloudFront | Mature, familiar | Viable, but costly for static files |
| **FastAPI static files** | No extra service, but every asset request wakes the API | Yes | Couples frontend releases to API releases | Slower static serving than a web server or CDN | Custom code for fallback, caching, and compression | Not recommended |

**Gotcha:** CloudFront's distribution-wide custom error responses (404 → `/index.html`) would also rewrite API errors. SPA fallback must therefore be a CloudFront Function attached only to the S3 behaviour.

**Why no production-like web server locally:** reproducing CloudFront's routing and headers in a local web server would be a second copy of that configuration, which can drift from the CDK definition and give false confidence. Production behaviour is tested on the real setup instead (see §4).

## 4. Final Selection

**Select: S3 + CloudFront in production; the Vite dev server in a Podman Compose service for local development.**

**Production**

- Private S3 bucket, accessed through CloudFront Origin Access Control.
- CloudFront Function for SPA fallback, on the default (S3) behaviour only.
- Response headers policy for the security headers.
- `/api/*` behaviour forwarding to the API origin, with caching disabled.

**Local development**

A `web` service in `compose.yaml` runs the Vite dev server in a Node.js container, next to the `api` and `db` services:

```yaml
web:
  build: { context: frontend, target: dev }   # Node.js stage, runs `vite --host 0.0.0.0`
  ports: ["5173:5173"]
  volumes:
    - ./frontend:/app                         # source, for hot reload
    - web_node_modules:/app/node_modules      # container-built dependencies
  environment:
    API_PROXY_TARGET: http://api:8000
  userns_mode: keep-id                        # files created in the container belong to the host user
```

- `node_modules` lives in a named volume, because esbuild and Rollup ship platform-specific binaries that differ between the container and the host.
- The `/api` proxy target is read from `API_PROXY_TARGET`, defaulting to `http://localhost:8000` when Vite runs on the host.
- The repository must stay on the WSL Linux filesystem (not `/mnt/c`) for file watching to work.
- Running `npm run dev` on the host remains possible, with `podman compose up api db`.
- Editor tooling (ESLint, TypeScript, Vitest) still needs `npm install` on the host, unless a dev container is adopted.

**Validation before release**

CI deploys to a staging stack (S3 + CloudFront from the same CDK code) and runs smoke tests against it: (1) deep links to SPA routes, (2) cache-control on `index.html` and on a hashed asset, (3) Brotli/gzip compression, (4) security headers, including a Content-Security-Policy that the production build satisfies, (5) `/api/*` routing, with API errors returned unchanged.

**Rationale:** the frontend is static, so a CDN serves it at near-zero cost with nothing to patch or scale, which matches the priority on cost. Locally, the Vite dev server gives hot reload and one-command startup; production behaviour is verified on the real CloudFront setup rather than on an imitation of it.

**Trade-off:** the frontend has no production image, so NFR-12 holds at the level of the `dist/` build. The production configuration can only be exercised in AWS, which requires a staging stack.

**Runner-up:** Nginx container in production, if the platform moves to a single host. Revisit if server-side rendering is introduced.

## References

- Vite — [Building for Production](https://vite.dev/guide/build) and [Deploying a Static Site](https://vite.dev/guide/static-deploy.html)
- Vite — [Server Options](https://vite.dev/config/server-options.html)
- Amazon CloudFront — [Restricting access to an Amazon S3 origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- Nginx — [Unprivileged container image](https://github.com/nginx/docker-nginx-unprivileged)
