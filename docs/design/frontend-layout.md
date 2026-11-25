# Net Worth Dashboard

**Frontend Layout**
**Version:** 0.2
**Status:** Draft

This document organizes the pages of the web app and what each one shows. It
builds on the existing Dashboard and Rebalancing pages and covers the features
in [the requirements](../requirements.md).

## 1. Principles

- **Monthly update first:** entering a new snapshot is one click away from every page.
- **Read and write are separate:** Dashboard and Rebalancing only display data and link to where it is edited.
- **Reuse existing components:** `Panel`, `MetricCard`, and the two-column grids.
- **Desktop and mobile:** every page works on a phone, including data entry.
- **Safe with money:** deletes need confirmation; unsaved changes are never lost silently.

## 2. Pages

| Route | Page | Requirements | Phase |
|---|---|---|---|
| `/` | Dashboard | FR-01–FR-04 | ✅ Existing |
| `/rebalancing` | Rebalancing: the plan, and editing its targets | FR-05, FR-10, FR-11 | ✅ Phase 7 |
| `/snapshots` | Snapshot list | FR-07 | 6 |
| `/snapshots/new`, `/snapshots/:id` | Snapshot form, including holdings and liabilities | FR-06–FR-09, FR-12 | 6 |
| `/settings/account` | Account and data | FR-14–FR-16 | 8 |
| `/sign-in`, `/sign-up`, `/reset-password` | Authentication | FR-13 | 8 |

## 3. App Shell

| Element | Desktop and tablet | Mobile (< 640 px) |
|---|---|---|
| Navigation | Top bar: Dashboard, Rebalancing, Snapshots | Bottom tab bar with the same three entries |
| New snapshot | Button in the top bar | Floating button |
| User menu | Settings, Hide amounts, Language, Sign out | Same, from the avatar |
| Banner | One at a time: stale snapshot, revaluation reminder, import result | Same |

The top bar replaces today's segmented control.

## 4. Page Contents

### Dashboard (existing)

- Same panels as today: metric cards, net worth change, history charts, investment mix, allocation, average movement, latest holdings.
- Category names and exclusions come from the user's categories instead of constants.
- "As of" links to that snapshot; "Latest holdings" links to Holdings.
- No snapshots: onboarding panel with three choices: first snapshot, import, or demo data (FR-18).
- One snapshot: history panels explain that a second snapshot is needed.

### Rebalancing

One page shows the plan and edits it. It replaces the separate settings pages.

- **View:** one table, one row per reserve and bucket (sub-buckets indented): name with what it holds, target
  (amount and share of the pool), current amount with a thin progress bar, and the gap (amber when over target).
  Below it, one quiet line each for the categories left out and the fill order. A warning lists holdings that no
  bucket accepts. No targets yet: a short explanation and **Set up targets**.
- **Edit targets:** the same table becomes the form: names, weights (with the resulting share), and reserve amounts
  are inputs, and what a row holds opens under it as chips. Current amounts and gaps update as you type, computed by
  the API (`POST /api/rebalancing/preview`) from the unsaved targets. **Split** adds a sub-bucket; **Remove**
  deletes a row. Two panels below: categories left out (of the plan, and of the disposable net value), and the fill
  order with move up and down buttons. Sticky footer with Cancel and Save; Save replaces all targets at once.
- Category rename, merge, and delete are not in the interface; the API supports them
  (`/api/categories/{id}`, `/api/categories/{id}/merge`).

### Snapshot List

- Table, newest first: date, net worth, change from previous, number of holdings, edit and delete.
- Mobile: one card per snapshot.

### Snapshot Form (new and edit)

- Date picker; a new snapshot is pre-filled from the latest one.
- Rows grouped by liquid assets, non-liquid assets, and liabilities, then by category; mortgages under their property.
- Each row: holding, previous value, new value, change. Changed rows are highlighted.
- Stale values show a revaluation hint (FR-17).
- Inline **Add holding** and **Add liability**.
- Holdings and liabilities are managed here, with no separate page: **Edit** under a row opens its form below it
  (name, category, liquidity, linked mortgage, closed), stating that changes apply to every snapshot. A holding
  without values can be deleted; one with history is closed instead. **Show closed** brings closed ones back to
  reopen them. Changing a category warns if a rebalancing bucket references the holding.
- Category and other holding details belong to the holding, not to a snapshot, so they are the same on every date.
- Sticky footer: new net worth against the previous one, Cancel, Save.
- Inline validation: duplicate date, future date, invalid amounts.
- Mobile: one card per holding; footer stays sticky.

### Settings › Account and Data

- Preferences: language, currency, email reminders.
- Import: YAML or CSV, with a preview of counts and conflicts before writing.
- Export: JSON and CSV.
- Delete account: offers an export first, then requires typing the account email.

### Authentication

- Centred card without navigation; screens depend on the authentication design.

## 5. Shared Patterns

| Pattern | Behaviour |
|---|---|
| Forms | Labels above inputs, validation on blur, sticky Cancel/Save bar |
| Amounts | Locale-aware input and display, right-aligned |
| Confirmations | Dialog stating exactly what will change |
| Feedback | Toast after saving, with Undo where possible |
| Loading | Skeleton panels; after 3 s, "Waking up the database…" (Aurora resume) |
| Errors | Inline in the failed panel, with Retry |
| Hide amounts | Masks all amounts for screen sharing; remembered per browser |
| Charts | Table alternative for keyboard and screen-reader users |

## 6. Responsive Rules

| Width | Grids | Metric cards per row | Data entry |
|---|---|---|---|
| ≥ 1024 px | Two columns | 4 | Table rows |
| 640–1023 px | One column | 2 | Table rows |
| < 640 px | One column | 1 | One card per holding |

## 7. Open Questions

- Path-based or hash-based routing (affects the CloudFront SPA fallback).
- Whether liabilities are entered as positive or negative amounts.
- Cognito managed login or custom sign-in forms.
