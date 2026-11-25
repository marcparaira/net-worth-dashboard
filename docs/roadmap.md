# Development Roadmap

## Phase 0 — Prototype

- [x] Scaffold React/Vite and Python/FastAPI applications.
- [x] Load and validate dated snapshots from YAML records.
- [x] Display summary metrics, history, allocation, holdings, and average monthly movement.
- [x] Add the rebalancing view, configured from `rebalancing.json`.
- [x] Add backend unit tests and a combined development script.

**Deliverable:** Working single-user dashboard backed by YAML files.

## Phase 1 — Repository Privacy

Keep personal financial data out of the repository and its history.

- [x] Move `backend/records/`, `backend/rebalancing.json`, and other personal notes to a local data directory outside version control.
- [x] Make the data directory configurable through an environment variable (`NET_WORTH_DATA_DIR`).
- [x] Add `.env` files and the old data locations to `.gitignore`.
- [x] Create a fictitious sample dataset (`sample-data/`) and point tests and the default configuration at it.
- [x] Remove personal data from the git history with `git filter-repo` before adding a remote.
- [x] Add secret and personal-data scanning with gitleaks as a pre-commit hook and in CI.

**Deliverable:** Repository that can be made public without exposing personal data.

## Phase 2 — Project Foundation

- [x] Create a multi-stage Podman Containerfile for the API, and a development Containerfile for the web application running the Vite dev server.
- [x] Add a `compose.yaml` that runs the web application (Vite dev server with hot reload), API, and PostgreSQL with `podman compose up --build`.
- [x] Migrate the frontend to TypeScript and pin dependency versions.
- [x] Set up linting, formatting, type checking, and tests for backend and frontend.
- [x] Set up GitHub Actions CI to lint, test, and build the images.
- [x] Document the local development commands.

**Deliverable:** One-command local environment with healthy services.

## Phase 3 — Release Process

Every pull request merged into `main` produces a versioned release.

- [x] Protect `main`: changes arrive only through pull requests from short-lived branches, with passing checks.
- [x] Require Conventional Commit pull request titles (`feat:`, `fix:`, `docs:`, …), checked in CI, and squash-merge so each pull request becomes one commit on `main`.
- [x] On every merge to `main`, derive the next semantic version from the pull request title, tag it, and publish a GitHub Release with notes grouped by type (semantic-release; every type releases, `feat` as minor and the rest as patch).
- [x] Attach release artifacts: the frontend build, and the API image pushed to GitHub Container Registry with the version tag.
- [x] Show the running version in the app and in `/api/health`.
- [x] Document the branching and release process (`CONTRIBUTING.md`).

**Deliverable:** Automatic, versioned releases with notes for every merged pull request.

## Phase 4 — Visual Design

The current styling looks generic. Define a design system before new pages are built on it.

- [x] Define design tokens as CSS custom properties: a colour palette (neutrals, one accent, and semantic colours for gains, losses, and warnings), typography scale, spacing, radii, and shadows.
- [x] Choose a colour-blind-safe chart palette, with one consistent colour per category across all charts.
- [x] Support light and dark themes, following the system setting.
- [x] Restyle the Dashboard and Rebalancing pages with the tokens: calm surfaces, clear hierarchy, and fewer decorative effects (gradients, glows, coloured edge bars, uppercase labels).
- [x] Present numbers consistently: tabular figures, right-aligned amounts, and one convention for signs and colours of changes.
- [x] Check WCAG AA contrast and visible keyboard focus.
- [x] Document the design system in `docs/design/visual-design.md`, with before and after screenshots.

**Deliverable:** A consistent, professional visual identity, applied to the existing pages and ready for the new ones.

## Phase 5 — Database Storage

**Data flow:** UI → FastAPI → PostgreSQL → Analytics → Dashboard

- [ ] Design the schema for users, holdings, snapshots, snapshot values, liabilities, categories, and rebalancing settings (buckets, reserves, members), with an owner on every row.
- [ ] Store amounts as exact decimals.
- [ ] Add database migrations.
- [ ] Replace the YAML and `rebalancing.json` loaders with a database repository layer, keeping the existing analytics unchanged.
- [ ] Add a command that imports YAML records and `rebalancing.json` into the database.
- [ ] Run the tests against a real PostgreSQL instance.

**Deliverable:** Dashboard and rebalancing served from the database, with identical results to the YAML and JSON version.

## Phase 6 — Data Entry from the UI

- [ ] Add API endpoints to create, update, and delete snapshots, holdings, and liabilities.
- [ ] Add a "New snapshot" form, pre-filled from the latest snapshot.
- [ ] Let users add, rename, recategorize, and close holdings, and link mortgages to properties.
- [ ] Validate input on client and server, with clear error messages.
- [ ] Add a snapshot list with edit and delete actions.

**Deliverable:** All financial data managed from the UI, with no file editing.

## Phase 7 — Rebalancing Settings

- [ ] Add API endpoints to read and replace the rebalancing settings in one transaction, with validation.
- [ ] Add an editor for buckets, weights, reserves, excluded categories, and fill order.
- [ ] Manage categories, including the categories excluded from disposable net value.
- [ ] Preview the effect of a change before saving it.

**Deliverable:** Rebalancing fully configurable from the UI.

## Phase 8 — Accounts and Multi-User

- [ ] Add sign-up, sign-in, sign-out, and password reset.
- [ ] Protect all API endpoints and scope every query to the signed-in user.
- [ ] Add tests that verify one user cannot access another user's data.
- [ ] Add data export (JSON and CSV) and account deletion.
- [ ] Add self-service import of YAML and CSV files.

**Deliverable:** Multiple users with isolated, exportable, and deletable data.

## Phase 9 — Usability and Localization

- [ ] Translate the UI into Catalan and English, with all text in translation files and locale-aware number, currency, and date formats.
- [ ] Let users choose the language from the user menu (remembered per user, and per browser before signing in); default to the browser language. Category and holding names are user data and are not translated.
- [ ] Make the snapshot form and dashboard usable on mobile.
- [ ] Add revaluation reminders for rarely updated holdings, such as properties.
- [ ] Add an empty-state onboarding flow for new users, with optional demo data.

**Deliverable:** First complete MVP, usable by people other than the author.

## Phase 10 — AWS Deployment

- [ ] Provision infrastructure using AWS CDK.
- [ ] Deploy the API to Lambda behind an API Gateway HTTP API, in private subnets without a NAT gateway, using IAM database authentication.
- [ ] Provision Aurora Serverless v2 (PostgreSQL) with a minimum of 0 ACU, and apply the Alembic migrations.
- [ ] Run the migrations and integration tests against Aurora to confirm compatibility with the local PostgreSQL.
- [ ] Build and publish the production API image from CI, and deploy the frontend build to S3 and CloudFront.
- [ ] Add a staging stack and CI smoke tests for SPA routing, cache and security headers, compression, and `/api/*` routing.
- [ ] Configure HTTPS, a custom domain, secrets management, encryption at rest, and automated backups.
- [ ] Test restoring the database from a backup.
- [ ] Add monitoring, alarms, and error reporting that do not record financial values.
- [ ] Write operational documentation and a privacy notice.

**Deliverable:** Publicly available application running on AWS.
