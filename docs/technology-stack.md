# Net Worth Dashboard
**Technology Stack**

**Version:** 0.1
**Status:** Prototype implemented; remaining decisions are subject to evaluation

## 1. Overview

This document summarizes the current and proposed technologies for the Net
Worth Dashboard.

Technologies marked **Selected** are used by the prototype or have been
decided. Technologies marked **Proposed** may be revised following technical
evaluations. System architecture is documented separately.

## 2. Proposed Technology Stack

| Component | Technology | Status |
|---|---|---|
| Frontend | React, Vite | Selected |
| Frontend Language | TypeScript 6.0 (7.0 once typescript-eslint supports it) | Selected |
| Charts | Recharts | Selected |
| Icons | Lucide | Selected |
| Frontend Development Container | Node.js running the Vite dev server (local only) | Selected |
| Backend | Python, FastAPI | Selected |
| Validation and API Schemas | Pydantic | Selected |
| Backend Container Runtime | Python 3.13 on Alpine Linux | Selected |
| Database | PostgreSQL 17 (same major version locally and in production) | Selected |
| ORM and Migrations | SQLAlchemy, Alembic | Selected |
| Authentication | Amazon Cognito (or a self-hosted alternative for local development) | Proposed |
| Internationalization | i18next (Catalan, English) | Proposed |
| Backend Tests | pytest (running the existing unittest tests) | Selected |
| Frontend Tests | Vitest, React Testing Library | Selected |
| Linting and Formatting | Ruff, basedpyright, ESLint (typescript-eslint), Prettier | Selected |
| Secret Scanning | gitleaks | Selected |
| CI | GitHub Actions | Selected |
| Release Automation | semantic-release, Conventional Commit pull request titles | Selected |
| Container Registry | GitHub Container Registry | Selected |
| Containerization | Podman, Podman Compose | Selected |
| Cloud Provider | Amazon Web Services (AWS) | Selected |
| Infrastructure as Code | AWS CDK (TypeScript) | Proposed |
| Static Hosting | Amazon S3 and CloudFront (production) | Selected |
| API Hosting | AWS Lambda (container image, Lambda Web Adapter) behind API Gateway HTTP API | Proposed |
| Managed Database | Amazon Aurora Serverless v2 (PostgreSQL), scaling to zero | Selected |
| Secrets | AWS Secrets Manager | Proposed |
| Monitoring | Amazon CloudWatch | Proposed |

## 3. Containerization

The local environment will be defined in a repository-root `compose.yaml`;
`podman compose up --build` will start the web application, the API, and
PostgreSQL.

Container definitions will live alongside their source in `frontend` and
`backend`. Personal data will never be copied into an image: the development
database is seeded from the fictitious sample dataset, and a user's own data is
loaded through the import command or the UI.

- Separate build and runtime environments.
- Multi-stage container builds.
- Minimal production runtime images.
- Independent service deployment.
- Backend containers will use Python on Alpine Linux.
- The same API image runs in development, CI, and production. The frontend
  has no production image: the Vite dev server runs in a compose service
  locally, and the `dist/` build is served by S3 and CloudFront in production
  (see [studies/frontend-runtime-study.md](studies/frontend-runtime-study.md)).

## 4. Data Storage

Financial data moves from YAML files in the repository to PostgreSQL: a
PostgreSQL container for local development and CI, and Aurora Serverless v2 in
production (see [studies/storage-study.md](studies/storage-study.md)). Each row
belongs to one user, and every query is scoped to the signed-in user. Amounts
are stored as `NUMERIC`, not floating point. Schema changes are applied through
Alembic migrations.

The existing analytics (`ledger`, `timeseries`, `dashboard`, `rebalancing`)
operate on validated Pydantic models and will stay independent of the storage
layer.

## 5. Deployment

The production setup is:

- **Static frontend:** S3 and CloudFront, with `/api/*` routed to the API
  origin. See [studies/frontend-runtime-study.md](studies/frontend-runtime-study.md).
- **API:** Lambda running the API container image, behind an API Gateway
  HTTP API, in private subnets with no NAT gateway. See
  [studies/api-hosting-study.md](studies/api-hosting-study.md).
- **Database:** Aurora Serverless v2 (PostgreSQL), pausing when idle, with
  encryption at rest and automated backups. See
  [studies/storage-study.md](studies/storage-study.md).

All infrastructure will be defined with AWS CDK.
