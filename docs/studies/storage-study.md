# Net Worth Dashboard
**Storage Selection Study**

**Version:** 0.2
**Status:** Decided

## 1. Scope

Select the storage for users' financial data (snapshots, holdings, liabilities,
categories, rebalancing settings, and user preferences), replacing the YAML
files in the repository.

Out of scope: authentication identities (handled by the authentication
provider), static frontend assets, and logs.

**Expected volume:** small. A user with ten years of monthly snapshots and 30
holdings has about 3,600 values. Even thousands of users fit in a few gigabytes.

**Expected usage:** low and irregular. Users typically enter one snapshot a
month and look at the dashboard occasionally, so the database is idle most of
the time.

**Priorities:** minimize the cloud cost, while developing locally against an
engine as close to production as possible.

## 2. Requirements

| ID | Requirement | Source |
|---|---|---|
| SR-01 | Isolate each user's data, enforced on the server. | NFR-02 |
| SR-02 | Store amounts exactly, with no floating-point rounding. | NFR-06 |
| SR-03 | Enforce integrity: unique snapshot date per user, holdings referenced across snapshots, atomic multi-row saves. | NFR-06, FR-06–FR-09 |
| SR-04 | Support history queries across snapshots and holdings. | FR-02, FR-04 |
| SR-05 | Encrypt at rest and in transit. | NFR-04 |
| SR-06 | Provide automated backups and point-in-time recovery. | NFR-05 |
| SR-07 | Support versioned schema changes. | Roadmap Phase 5 |
| SR-08 | Run locally in Podman Compose with an engine that behaves like production. | NFR-12 |
| SR-09 | Minimize cost at small scale and low, irregular usage. | NFR-11 |
| SR-10 | Require little operational effort. | — |
| SR-11 | Support full export and deletion of a user's data. | FR-15, FR-16, NFR-14 |

## 3. Options Considered

| Option | Description |
|---|---|
| A. Files in S3 | Keep the YAML/JSON format, one object per user, stored in Amazon S3. |
| B. SQLite | Embedded database file, replicated to S3 with Litestream. |
| C. DynamoDB | AWS managed key-value/document database, on-demand capacity. |
| D. PostgreSQL on RDS | Managed PostgreSQL, single small instance. |
| E. Aurora Serverless v2 (PostgreSQL) | PostgreSQL-compatible, capacity scales with load, including down to zero. |

## 4. Analysis

✔ meets · ◐ partially meets · ✘ does not meet

| Req. | A. S3 files | B. SQLite | C. DynamoDB | D. RDS PostgreSQL | E. Aurora Serverless v2 |
|---|---|---|---|---|---|
| SR-01 Isolation | ◐ Prefix per user, enforced in app code | ◐ App code only | ◐ Partition key per user; IAM conditions possible | ✔ App scoping plus row-level security | ✔ Same as D |
| SR-02 Exact amounts | ◐ Strings parsed as decimals | ◐ No decimal type; store integer cents | ◐ Number type is exact, but limited by SDK handling | ✔ `NUMERIC` | ✔ `NUMERIC` |
| SR-03 Integrity | ✘ No constraints or transactions across objects | ✔ Constraints and transactions | ◐ Limited transactions, no foreign keys | ✔ Full constraints and transactions | ✔ Same as D |
| SR-04 History queries | ◐ Load everything and compute in memory | ✔ SQL | ◐ Access patterns designed up front | ✔ SQL, window functions | ✔ Same as D |
| SR-05 Encryption | ✔ | ◐ Disk and replica encryption only | ✔ | ✔ | ✔ |
| SR-06 Backups and PITR | ◐ Object versioning | ◐ Litestream replica; restore is manual | ✔ PITR | ✔ Automated backups and PITR | ✔ Same as D |
| SR-07 Migrations | ✘ Hand-written conversion scripts | ✔ Alembic | ✘ No schema; migrations in code | ✔ Alembic | ✔ Alembic |
| SR-08 Local parity | ◐ MinIO or local files | ✔ Same file format | ◐ DynamoDB Local emulator | ✔ Official PostgreSQL image | ◐ Aurora cannot run locally; a PostgreSQL image of the same major version matches SQL behaviour, but not pausing, resuming, or failover |
| SR-09 Cost | ✔ Near zero | ✔ Near zero, plus EFS or one instance | ✔ Near zero on demand | ◐ Instance bills all month, even when idle | ✔ Scales to 0 capacity when idle; pays mainly for storage |
| SR-10 Operations | ✔ | ✘ Single writer; constrains API to one container | ✔ | ✔ Managed | ◐ Managed, but connections must close when idle for the database to pause |
| SR-11 Export and deletion | ✔ Per-user object | ✔ | ✔ Query by partition key | ✔ Cascade delete | ✔ Same as D |

**Summary:**

- **A** keeps the current format but has no integrity guarantees or transactions; it is a step backwards from a real data model.
- **B** is cheap and simple, but a single writer file conflicts with stateless API containers on AWS.
- **C** is cheap and fully managed, but the data is relational (users → holdings → snapshot values) and history queries are ad hoc, which a key-value model handles poorly.
- **D** meets every requirement; its only weakness is a fixed monthly cost for the smallest instance.
- **E** is SQL-compatible with D and, for an app that is idle most of the time, much cheaper; the costs are a delay of about 15 seconds on the first request after a pause, and operational behaviour that cannot be reproduced locally.

## 5. Final Decision

**PostgreSQL**, accessed through SQLAlchemy with Alembic migrations.

- **Local development and CI:** official PostgreSQL container in Podman Compose, pinned to the same major version as production. Aurora is not used during development.
- **Production:** Aurora Serverless v2 (PostgreSQL-compatible), single writer instance, minimum capacity 0 ACU so it pauses when idle, with encryption at rest, TLS, automated backups, and point-in-time recovery.
- **Migration to production:** the schema is created on Aurora by running the same Alembic migrations; data is loaded with the import command or a `pg_dump` / `pg_restore`.
- **Isolation:** every table carries a `user_id`; queries are scoped in the repository layer, with PostgreSQL row-level security as a second safeguard.
- **Amounts:** `NUMERIC(14, 2)`, with the currency stored per user.

**Constraints on the application**, so local and production behave the same:

- Use only PostgreSQL features and extensions that Aurora PostgreSQL supports for the chosen version.
- Let idle connections close (small pool, short idle timeout); do not use RDS Proxy or keep-alive connections, which prevent the database from pausing.
- Allow for the resume delay: a longer connection timeout with a retry in the API, and a loading state in the UI.
- Before the first release, run the migrations and integration tests once against an Aurora cluster to confirm compatibility.

**Revisit** RDS for PostgreSQL if usage becomes steady enough that Aurora's
active capacity costs more than a small instance, and Multi-AZ once
availability matters more than cost. Both stay PostgreSQL, so the application
code does not change.
