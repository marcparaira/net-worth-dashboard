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
| `/rebalancing` | Rebalancing | FR-05 | ✅ Existing |
| `/snapshots` | Snapshot list | FR-07 | 6 |
| `/snapshots/new`, `/snapshots/:date` | Snapshot form | FR-06, FR-07, FR-12 | 6 |
| `/holdings` | Holding list | FR-08, FR-09 | 6 |
| `/holdings/:id` | Holding detail | FR-08, FR-09 | 6 |
| `/settings/categories` | Categories | FR-10 | 7 |
| `/settings/rebalancing` | Rebalancing targets | FR-11 | 7 |
| `/settings/account` | Account and data | FR-14–FR-16 | 8 |
| `/sign-in`, `/sign-up`, `/reset-password` | Authentication | FR-13 | 8 |

## 3. App Shell

| Element | Desktop and tablet | Mobile (< 640 px) |
|---|---|---|
| Navigation | Top bar: Dashboard, Rebalancing, Snapshots, Holdings | Bottom tab bar with the same four entries |
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

### Rebalancing (existing)

- Same panels as today: summary cards, target vs current, where the money should be, what counts as what.
- The `rebalancing.json` caption becomes an **Edit targets** button.
- The unassigned-holdings warning links to the target editor.
- No targets yet: short explanation and **Set up targets**.

### Snapshot List

- Table, newest first: date, net worth, change from previous, number of holdings, edit and delete.
- Mobile: one card per snapshot.

### Snapshot Form (new and edit)

- Date picker; a new snapshot is pre-filled from the latest one.
- Rows grouped by liquid assets, non-liquid assets, and liabilities, then by category; mortgages under their property.
- Each row: holding, previous value, new value, change. Changed rows are highlighted.
- Stale values show a revaluation hint (FR-17).
- Inline **Add holding** and **Add liability**.
- Sticky footer: new net worth against the previous one, Cancel, Save.
- Inline validation: duplicate date, future date, invalid amounts.
- Mobile: one card per holding; footer stays sticky.

### Holding List

- Grouped by liquid, non-liquid, and liabilities: name, category, latest value, sparkline.
- Closed holdings hidden by default; **Add holding**.

### Holding Detail

- Form: name, category, liquidity, linked mortgage, revaluation interval.
- Value history chart, including the linked mortgage.
- **Close** keeps history and hides the holding from new snapshots; a holding with no values can be deleted.
- Changing the category warns if a rebalancing bucket references the holding.

### Settings › Categories

- Table: name, number of holdings, excluded from disposable value, excluded from rebalancing.
- Rename inline; a category in use can be merged, not deleted.

### Settings › Rebalancing Targets

- **Editor (left):** reserves (name, amount, source categories); bucket tree (name, weight, resulting share, members); fill order as a draggable list.
- **Preview (right):** target vs current computed from the unsaved settings, with warnings for unassigned holdings.
- Inline validation; sticky footer with Discard and Save; Save replaces all settings in one transaction.
- Mobile: preview below the editor, collapsed.

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
- Whether the target preview needs an API endpoint or computes in the browser.
- Whether liabilities are entered as positive or negative amounts.
- Cognito managed login or custom sign-in forms.
