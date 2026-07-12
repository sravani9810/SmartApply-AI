import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import ExcelJS from "exceljs";
import type { JobPosting } from "@smartapply/shared";
import { COLUMNS, flatten } from "../columns.js";

/**
 * Persists discovered postings into a structured Excel workbook, one row per
 * job. Rows are keyed by `id` so re-running the search updates existing rows
 * instead of duplicating them. The column schema lives in ../columns.ts and is
 * shared with the Google Sheets sink.
 */
const SHEET = "Jobs";

/** Load an existing workbook or create a new one with a formatted header row. */
async function open(path: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(path);
  } catch {
    // New workbook — create the sheet and header.
  }
  let sheet = wb.getWorksheet(SHEET);
  if (!sheet) {
    sheet = wb.addWorksheet(SHEET);
    sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    sheet.getRow(1).font = { bold: true };
  } else {
    // ExcelJS doesn't persist column keys, so reassign them by position when a
    // workbook is loaded from disk — otherwise getCell(key)/keyed values fail.
    COLUMNS.forEach((c, i) => {
      sheet!.getColumn(i + 1).key = c.key;
    });
  }
  return wb;
}

function findRowById(sheet: ExcelJS.Worksheet, id: string): ExcelJS.Row | undefined {
  let found: ExcelJS.Row | undefined;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header
    if (row.getCell("id").value === id) found = row;
  });
  return found;
}

/** Upsert the given postings into the workbook and save it to disk. */
export async function saveJobs(postings: JobPosting[], path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const wb = await open(path);
  const sheet = wb.getWorksheet(SHEET)!;

  for (const job of postings) {
    const row = flatten(job);
    const existing = findRowById(sheet, job.id);
    if (existing) {
      existing.values = { ...(existing.values as object), ...row };
      existing.commit();
    } else {
      sheet.addRow(row).commit();
    }
  }

  await wb.xlsx.writeFile(path);
}
