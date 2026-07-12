import { google, type sheets_v4 } from "googleapis";
import type { JobPosting } from "@smartapply/shared";
import { HEADERS, flatten, toRowArray } from "../columns.js";

/**
 * Google Sheets sink. Mirrors the Excel writer: one row per job, keyed by the
 * ID in column A so re-runs update existing rows (preserving any manual edits
 * in other columns, e.g. Status) instead of duplicating them.
 *
 * Auth uses a service account. Share the target spreadsheet with the service
 * account's email (Editor) and point GOOGLE_APPLICATION_CREDENTIALS at its JSON
 * key — see the package README.
 */
export interface GoogleSheetsConfig {
  /** Spreadsheet ID (the long token in the sheet's URL). */
  spreadsheetId: string;
  /** Tab name to write to. Created if missing. */
  sheetName: string;
  /** Path to the service-account JSON key. Falls back to
   *  GOOGLE_APPLICATION_CREDENTIALS when omitted. */
  keyFile?: string;
}

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

async function getClient(cfg: GoogleSheetsConfig): Promise<sheets_v4.Sheets> {
  const auth = new google.auth.GoogleAuth({
    scopes: SCOPES,
    ...(cfg.keyFile ? { keyFile: cfg.keyFile } : {}),
  });
  return google.sheets({ version: "v4", auth: await auth.getClient() as never });
}

/** Ensure the target tab exists; return true if the header row must be written. */
async function ensureSheet(
  api: sheets_v4.Sheets,
  cfg: GoogleSheetsConfig,
): Promise<void> {
  const meta = await api.spreadsheets.get({ spreadsheetId: cfg.spreadsheetId });
  const exists = meta.data.sheets?.some(
    (s) => s.properties?.title === cfg.sheetName,
  );
  if (!exists) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId: cfg.spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: cfg.sheetName } } }],
      },
    });
  }
}

/** A1 range for a full-width row at the given 1-based row number. */
function rowRange(sheet: string, rowNumber: number): string {
  const lastCol = String.fromCharCode("A".charCodeAt(0) + HEADERS.length - 1);
  return `${sheet}!A${rowNumber}:${lastCol}${rowNumber}`;
}

/** Upsert the given postings into a Google Sheet. */
export async function syncToGoogleSheet(
  postings: JobPosting[],
  cfg: GoogleSheetsConfig,
): Promise<{ updated: number; appended: number }> {
  const api = await getClient(cfg);
  await ensureSheet(api, cfg);

  // Read existing IDs (column A) to build an id -> rowNumber map.
  const existing = await api.spreadsheets.values.get({
    spreadsheetId: cfg.spreadsheetId,
    range: `${cfg.sheetName}!A:A`,
  });
  const colA = existing.data.values ?? [];
  const hasHeader = colA.length > 0 && colA[0]?.[0] === HEADERS[0];
  const idToRow = new Map<string, number>();
  colA.forEach((r, i) => {
    if (i === 0 && hasHeader) return;
    const id = r?.[0];
    if (id) idToRow.set(String(id), i + 1); // 1-based row number
  });

  const updates: sheets_v4.Schema$ValueRange[] = [];
  const appends: Array<Array<string | number>> = [];

  // Write the header row if the sheet is empty.
  if (!hasHeader) {
    updates.push({ range: rowRange(cfg.sheetName, 1), values: [HEADERS] });
  }

  for (const job of postings) {
    const values = toRowArray(flatten(job));
    const row = idToRow.get(job.id);
    if (row) {
      updates.push({ range: rowRange(cfg.sheetName, row), values: [values] });
    } else {
      appends.push(values);
    }
  }

  if (updates.length) {
    await api.spreadsheets.values.batchUpdate({
      spreadsheetId: cfg.spreadsheetId,
      requestBody: { valueInputOption: "RAW", data: updates },
    });
  }
  if (appends.length) {
    await api.spreadsheets.values.append({
      spreadsheetId: cfg.spreadsheetId,
      range: `${cfg.sheetName}!A:A`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: appends },
    });
  }

  return { updated: updates.length - (hasHeader ? 0 : 1), appended: appends.length };
}

/**
 * Accept either a bare spreadsheet ID or a full sheet URL and return the ID.
 * `https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0` -> `<ID>`.
 */
export function extractSpreadsheetId(value: string): string {
  const m = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : value.trim();
}

/** Build a GoogleSheetsConfig from env, or return undefined if not configured. */
export function googleSheetsConfigFromEnv(): GoogleSheetsConfig | undefined {
  const raw = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!raw) return undefined;
  return {
    spreadsheetId: extractSpreadsheetId(raw),
    sheetName: process.env.GOOGLE_SHEETS_TAB ?? "Jobs",
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  };
}
