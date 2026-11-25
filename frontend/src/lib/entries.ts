// Pure logic for the snapshot form: parsing amounts, building the rows, and validation.
// The server applies the same rules; checking here gives immediate feedback.
import type { HoldingOut, LiabilityOut, SnapshotIn, SnapshotValue } from '../api/types';

const AMOUNT = /^\d+(?:[.,]\d+)?$/;
const MAX_AMOUNT = 1e12;

export interface ParsedAmount {
  /** The amount, or null when the field is empty (the item is not in the snapshot). */
  amount: number | null;
  error: string;
}

/** Parses what the user typed: "1234", "1234.5", "1234,56"; spaces are ignored. */
export function parseAmount(text: string): ParsedAmount {
  const cleaned = text.replace(/[\s\u00a0']/g, '');
  if (!cleaned) return { amount: null, error: '' };
  if (cleaned.startsWith('-')) return { amount: null, error: 'Enter a positive amount; debts go under liabilities' };
  if (!AMOUNT.test(cleaned)) return { amount: null, error: 'Enter a number, like 1234.56' };
  const [, decimals = ''] = cleaned.split(/[.,]/);
  if (decimals.length > 2) return { amount: null, error: 'Use at most two decimals' };
  const amount = Number(cleaned.replace(',', '.'));
  if (amount >= MAX_AMOUNT) return { amount: null, error: 'This amount is too large' };
  return { amount, error: '' };
}

/** An amount as editable text: "1500", "1500.50". */
export const amountText = (amount: number | null | undefined): string =>
  amount == null ? '' : Number.isInteger(amount) ? String(amount) : amount.toFixed(2);

export interface EntryRow {
  /** "holding:<id>" or "liability:<id>". */
  key: string;
  kind: 'holding' | 'liability';
  id: string;
  name: string;
  /** Category for holdings; "Mortgage" or "Liability" for liabilities. */
  label: string;
  /** For a mortgage, the key of its property's row. */
  propertyKey: string | null;
  previous: number | null;
}

export interface EntryGroup {
  key: 'liquid' | 'non_liquid' | 'liabilities';
  title: string;
  rows: EntryRow[];
}

const holdingKey = (id: string) => `holding:${id}`;
const liabilityKey = (id: string) => `liability:${id}`;

function valueMap(values: SnapshotValue[] | undefined): Map<string, number> {
  return new Map(
    (values ?? []).map((v) => [v.holding_id ? holdingKey(v.holding_id) : liabilityKey(v.liability_id ?? ''), v.amount]),
  );
}

/**
 * Rows of the snapshot form, grouped by liquidity, with each mortgage right after its property.
 * Closed holdings and liabilities are left out unless the snapshot being edited has a value for them.
 */
export function buildGroups(
  holdings: HoldingOut[],
  liabilities: LiabilityOut[],
  previous: SnapshotValue[] | undefined,
  current: SnapshotValue[] | undefined,
): EntryGroup[] {
  const before = valueMap(previous);
  const now = valueMap(current);
  const shown = (key: string, closedOn: string | null) => !closedOn || now.has(key);
  const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

  const liabilityRow = (liability: LiabilityOut, propertyKey: string | null): EntryRow => ({
    key: liabilityKey(liability.id),
    kind: 'liability',
    id: liability.id,
    name: liability.name,
    label: propertyKey ? 'Mortgage' : 'Liability',
    propertyKey,
    previous: before.get(liabilityKey(liability.id)) ?? null,
  });
  const holdingRow = (holding: HoldingOut): EntryRow => ({
    key: holdingKey(holding.id),
    kind: 'holding',
    id: holding.id,
    name: holding.name,
    label: holding.category,
    propertyKey: null,
    previous: before.get(holdingKey(holding.id)) ?? null,
  });

  const visibleHoldings = holdings.filter((h) => shown(holdingKey(h.id), h.closed_on));
  const visibleLiabilities = liabilities.filter((l) => shown(liabilityKey(l.id), l.closed_on));
  const visibleHoldingIds = new Set(visibleHoldings.map((h) => h.id));
  const mortgageOf = new Map(visibleLiabilities.filter((l) => l.holding_id).map((l) => [l.holding_id, l]));

  const holdingRows = (liquidity: HoldingOut['liquidity']): EntryRow[] =>
    visibleHoldings
      .filter((h) => h.liquidity === liquidity)
      .sort((a, b) => a.category.localeCompare(b.category) || byName(a, b))
      .flatMap((h) => {
        const mortgage = mortgageOf.get(h.id);
        return mortgage ? [holdingRow(h), liabilityRow(mortgage, holdingKey(h.id))] : [holdingRow(h)];
      });

  // Standalone liabilities, plus mortgages whose property is not in the form (closed).
  const otherLiabilities = visibleLiabilities
    .filter((l) => !l.holding_id || !visibleHoldingIds.has(l.holding_id))
    .sort(byName)
    .map((l) => liabilityRow(l, null));

  return [
    { key: 'liquid' as const, title: 'Liquid assets', rows: holdingRows('liquid') },
    { key: 'non_liquid' as const, title: 'Non-liquid assets', rows: holdingRows('non_liquid') },
    { key: 'liabilities' as const, title: 'Liabilities', rows: otherLiabilities },
  ].filter((group) => group.rows.length);
}

/** Editable text for every row, from a snapshot's values (empty when the row has none). */
export function initialTexts(groups: EntryGroup[], values: SnapshotValue[] | undefined): Record<string, string> {
  const amounts = valueMap(values);
  return Object.fromEntries(groups.flatMap((g) => g.rows).map((row) => [row.key, amountText(amounts.get(row.key))]));
}

/** Assets minus liabilities, for the amounts that parse; empty or invalid fields count as zero. */
export function netWorth(groups: EntryGroup[], amountOf: (row: EntryRow) => number | null): number {
  return groups
    .flatMap((g) => g.rows)
    .reduce((total, row) => total + (row.kind === 'holding' ? 1 : -1) * (amountOf(row) ?? 0), 0);
}

export interface SnapshotErrors {
  date: string;
  /** Per row key. */
  amounts: Record<string, string>;
  form: string;
}

export const hasErrors = (errors: SnapshotErrors): boolean =>
  Boolean(errors.date || errors.form || Object.values(errors.amounts).some(Boolean));

/** Today in the browser's time zone, as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function validateSnapshot(
  date: string,
  takenDates: string[],
  groups: EntryGroup[],
  texts: Record<string, string>,
  today: string = todayIso(),
): SnapshotErrors {
  const errors: SnapshotErrors = { date: '', amounts: {}, form: '' };
  if (!date) errors.date = 'Choose a date';
  else if (date > today) errors.date = 'The date cannot be in the future';
  else if (takenDates.includes(date)) errors.date = `There is already a snapshot on ${date}`;

  const rows = groups.flatMap((g) => g.rows);
  const parsed = new Map(rows.map((row) => [row.key, parseAmount(texts[row.key] ?? '')]));
  for (const row of rows) {
    const { amount, error } = parsed.get(row.key) ?? { amount: null, error: '' };
    if (error) errors.amounts[row.key] = error;
    else if (amount !== null && row.propertyKey && parsed.get(row.propertyKey)?.amount == null)
      errors.amounts[row.key] = "Enter the property's value too";
  }
  if (![...parsed.values()].some((p) => p.amount !== null)) errors.form = 'Enter at least one value';
  return errors;
}

/** The request body for the API: every row with an amount. */
export function snapshotPayload(date: string, groups: EntryGroup[], texts: Record<string, string>): SnapshotIn {
  const values = groups
    .flatMap((g) => g.rows)
    .flatMap((row) => {
      const { amount } = parseAmount(texts[row.key] ?? '');
      if (amount === null) return [];
      return [
        {
          holding_id: row.kind === 'holding' ? row.id : null,
          liability_id: row.kind === 'liability' ? row.id : null,
          amount,
        },
      ];
    });
  return { date, values };
}
