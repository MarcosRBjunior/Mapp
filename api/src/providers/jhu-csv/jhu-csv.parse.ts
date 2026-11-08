import { z } from 'zod';
import { isIsoDate } from '../../lib/dates.js';
import type { SeriesRow } from '../covid-provider.js';
import { ProviderPayloadError } from '../provider-errors.js';

// D-02: the JHU CSSE global series runs from 2020-01-22 to 2023-03-09.
export const JHU_CSV_FIRST_DATE = '2020-01-22';
export const JHU_CSV_FINAL_DATE = '2023-03-09';

const LOCATION_COLUMNS = ['Province/State', 'Country/Region', 'Lat', 'Long'] as const;
const DAY_MS = 86_400_000;
const MAX_DETAIL_LENGTH = 500;

// RFC 4180: quoted fields may hold commas ("Korea, South") and doubled quotes; CRLF or LF.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (quoted) {
    throw new ProviderPayloadError('CSV has an unterminated quoted field');
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// The header writes dates as M/D/YY (1/22/20).
function toIsoDate(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(value);
  if (!match) return null;
  const [, month = '', day = '', year = ''] = match;
  const iso = `20${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

const headerSchema = z
  .array(z.string())
  .refine(
    (header) => LOCATION_COLUMNS.every((name, index) => header[index] === name),
    `must start with ${LOCATION_COLUMNS.join(',')}`,
  )
  .transform((header, ctx) => {
    const dates: string[] = [];
    for (const [offset, label] of header.slice(LOCATION_COLUMNS.length).entries()) {
      const date = toIsoDate(label);
      if (date === null) {
        ctx.addIssue({ code: 'custom', message: `column ${label} is not a M/D/YY date` });
        return z.NEVER;
      }
      if (daysBetween(JHU_CSV_FIRST_DATE, date) !== offset) {
        ctx.addIssue({
          code: 'custom',
          message: `dates must be consecutive days from ${JHU_CSV_FIRST_DATE}; found ${date} at position ${offset}`,
        });
        return z.NEVER;
      }
      dates.push(date);
    }
    if (dates.at(-1) === undefined || (dates.at(-1) ?? '') < JHU_CSV_FINAL_DATE) {
      ctx.addIssue({ code: 'custom', message: `dates must reach ${JHU_CSV_FINAL_DATE}` });
      return z.NEVER;
    }
    return dates;
  });

const totalSchema = z
  .string()
  .regex(/^\d+$/, 'must be a non-negative integer')
  .transform(Number)
  .pipe(z.number().int().max(Number.MAX_SAFE_INTEGER));

function rowSchema(width: number) {
  return z
    .array(z.string())
    .length(width, `must have ${width} columns`)
    .transform(([region = '', country = '', , , ...totals]) => ({ region, country, totals }))
    .pipe(
      z.object({
        region: z.string(),
        country: z.string().min(1, 'Country/Region must not be empty'),
        totals: z.array(totalSchema),
      }),
    );
}

function fail(where: string, error: z.ZodError): never {
  throw new ProviderPayloadError(`${where}: ${z.prettifyError(error)}`.slice(0, MAX_DETAIL_LENGTH));
}

// One row per (Country/Region, Province/State); new = total minus the previous day's total
// (the first day has no previous total, so its new is its total). Dates after the final one are dropped.
export function parseTimeSeries(text: string): SeriesRow[] {
  const [header, ...body] = parseCsv(text);
  if (header === undefined) {
    throw new ProviderPayloadError('CSV is empty');
  }
  const parsedHeader = headerSchema.safeParse(header);
  if (!parsedHeader.success) fail('header', parsedHeader.error);
  const dates = parsedHeader.data.slice(0, daysBetween(JHU_CSV_FIRST_DATE, JHU_CSV_FINAL_DATE) + 1);

  const schema = rowSchema(header.length);
  const seen = new Set<string>();
  const rows: SeriesRow[] = [];
  for (const [index, cells] of body.entries()) {
    if (cells.length === 1 && cells[0] === '') continue;
    const parsed = schema.safeParse(cells);
    if (!parsed.success) fail(`row ${index + 2}`, parsed.error);
    const { country, region, totals } = parsed.data;
    const key = `${country}\u0000${region}`;
    if (seen.has(key)) {
      throw new ProviderPayloadError(`row ${index + 2}: ${country} / ${region} appears twice`);
    }
    seen.add(key);
    rows.push({
      country,
      region,
      points: dates.map((date, day) => {
        const total = totals[day] ?? 0;
        return { date, total, new: day === 0 ? total : total - (totals[day - 1] ?? 0) };
      }),
    });
  }
  if (rows.length === 0) {
    throw new ProviderPayloadError('CSV has no data rows');
  }
  return rows;
}
