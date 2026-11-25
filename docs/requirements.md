# Net Worth Dashboard
**High-Level Requirements Document**

**Version:** 0.1
**Status:** Draft

## 1. Executive Summary

The objective is to turn the existing single-user net worth prototype into a
web application that individuals can use to track their personal balance sheet
over time.

Users record dated snapshots of their assets and liabilities. The platform
turns those snapshots into a view of net worth, liquidity, allocation, and
growth, and compares the current allocation with user-defined targets to
support rebalancing decisions.

The prototype reads snapshots from YAML files committed to the repository. The
application will store data in a database, let users manage it from the UI,
keep each user's financial data private, and run on AWS.

## 2. Scope

The platform will provide:

- **Balance sheet tracking:** Dated snapshots of liquid assets, non-liquid
  assets, mortgages, and other liabilities.
- **Data entry:** Creating, editing, and deleting snapshots and holdings from
  the UI, with no file editing.
- **Analytics:** Net worth, disposable net value, history, allocation, and
  average monthly movement.
- **Rebalancing:** User-defined target allocation, reserves, and fill order,
  compared with the latest snapshot.
- **Accounts and privacy:** Per-user accounts, with each user's financial data
  isolated from other users and from the source repository.

The initial release targets individual users tracking their own finances.
Shared households, advisors, and bank integrations are out of scope for now.

## 3. Functional Requirements

| ID | Requirement | Description |
|---|---|---|
| FR-01 | Summary Metrics | Display current liquid assets, non-liquid assets, liabilities, net worth, and disposable net value. |
| FR-02 | History | Show the historical balance sheet and the history of individual holdings. |
| FR-03 | Allocation | Show the current asset allocation by category. |
| FR-04 | Growth Metrics | Show average monthly movement, with a selectable basis (last 12 months or all time). |
| FR-05 | Rebalancing View | Compare the latest snapshot with the target allocation and show what to move where. |
| FR-06 | Create Snapshot | Add a new dated snapshot from the UI, pre-filled with the holdings and values of the latest snapshot. |
| FR-07 | Edit and Delete Snapshots | Correct or remove existing snapshots, with confirmation before deletion. |
| FR-08 | Manage Holdings | Add, rename, recategorize, and close holdings (accounts, properties, vehicles, pensions), keeping a holding's identity across snapshots. |
| FR-09 | Mortgages and Liabilities | Record mortgages linked to a property and standalone liabilities. |
| FR-10 | Categories | Manage asset categories, including which categories are excluded from disposable net value. |
| FR-11 | Rebalancing Targets | Edit buckets, weights, reserves, exclusions, and fill order from the UI, with validation. |
| FR-12 | Input Validation | Reject invalid values (missing dates, duplicate snapshot dates, non-numeric amounts) with clear messages. |
| FR-13 | User Accounts | Let users sign up, sign in, sign out, and reset their password. |
| FR-14 | Import | Import existing snapshots from the prototype's YAML format, and from CSV. |
| FR-15 | Export | Export all of a user's data in an open format (JSON or CSV). |
| FR-16 | Account Deletion | Let users permanently delete their account and all their data. |
| FR-17 | Revaluation Reminders | Remind users to update values that change rarely, such as property appraisals. |
| FR-18 | Demo Data | Provide a fictitious sample dataset for development, tests, and demos. |

## 4. Non-Functional Requirements

| ID | Requirement | Description |
|---|---|---|
| NFR-01 | Privacy | Keep personal financial data out of the source repository and its history; only fictitious sample data may be committed. |
| NFR-02 | Data Isolation | Scope every query to the signed-in user; one user must never be able to read or change another user's data. |
| NFR-03 | Security | Use HTTPS everywhere, secure authentication, least-privilege cloud access, and secrets kept out of code. |
| NFR-04 | Encryption | Encrypt data at rest and in transit, including backups. |
| NFR-05 | Durability | Back up data automatically, with point-in-time recovery and a tested restore procedure. |
| NFR-06 | Data Integrity | Store amounts as exact decimals, not floating point, and validate data on the server. |
| NFR-07 | Auditability | Record when snapshots and settings were created and last changed. |
| NFR-08 | Performance | Load the dashboard in under two seconds for a user with several years of monthly snapshots. |
| NFR-09 | Usability | Make entering a monthly snapshot quick, on desktop and mobile. |
| NFR-10 | Localization | Support at least Catalan, Spanish, and English, with locale-aware number, currency, and date formats. |
| NFR-11 | Cost | Keep the hosting cost appropriate for a small user base, scaling with use. |
| NFR-12 | Reproducible Environments | Run development, CI, and production from the same container images or build artifacts. |
| NFR-13 | Observability | Collect logs, metrics, and error reports without recording financial values or personal data. |
| NFR-14 | Compliance | Handle personal data according to GDPR, including data export (FR-15) and erasure (FR-16). |

## 5. Data

| Data | Information | Sensitivity |
|---|---|---|
| Snapshots | Date and set of holding values at that date | Personal, financial |
| Holdings | Name, category, liquidity, linked mortgage | Personal, financial |
| Liabilities | Name and outstanding amount | Personal, financial |
| Rebalancing settings | Buckets, weights, reserves, exclusions, fill order | Personal, financial |
| User accounts | Email, authentication identity, preferences | Personal |
| Sample dataset | Fictitious snapshots for development and demos | Public |

**Data considerations:** All values are entered manually by the user and are
estimates as of the snapshot date (for example, property values taken from an
appraisal range). The platform must show snapshot dates clearly and must not
present interpolated or derived figures as recorded values.

---

**Note:** Technology stack, system architecture, infrastructure, and detailed
implementation specifications are defined in separate documents.
