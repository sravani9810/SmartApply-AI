import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import ExcelJS from "exceljs";
import type { JobPosting } from "@smartapply/shared";

/**
 * Persists discovered postings into a structured Excel workbook, one row per
 * job. Rows are keyed by `id` so re-running the search updates existing rows
 * instead of duplicating them.
 *
 * Columns capture exactly what Part 1 must save: link, dates (posted / end),
 * and recruiter contact (email, phone), plus tracking fields (status, source,
 * fit).
 */
const SHEET = "Jobs";

const COLUMNS: Array<{ header: string; key: keyof FlatRow; width: number }> = [
  { header: "ID", key: "id", width: 18 },
  { header: "Title", key: "title", width: 30 },
  { header: "Company", key: "company", width: 24 },
  { header: "Location", key: "location", width: 18 },
  { header: "Source", key: "source", width: 14 },
  { header: "Link", key: "url", width: 40 },
  { header: "Date Posted", key: "datePosted", width: 14 },
  { header: "End Date", key: "endDate", width: 14 },
  { header: "Recruiter", key: "recruiterName", width: 20 },
  { header: "Recruiter Email", key: "recruiterEmail", width: 26 },
  { header: "Recruiter Phone", key: "recruiterPhone", width: 18 },
  { header: "Status", key: "status", width: 12 },
  { header: "Fit Score", key: "fitScore", width: 10 },
  { header: "Captured At", key: "capturedAt", width: 22 },
];

interface FlatRow {
  id: string;
  title: string;
  company: string;
  location: string;
  source: string;
  url: string;
  datePosted: string;
  endDate: string;
  recruiterName: string;
  recruiterEmail: string;
  recruiterPhone: string;
  status: string;
  fitScore: number | "";
  capturedAt: string;
}

function flatten(job: JobPosting): FlatRow {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location ?? "",
    source: job.source,
    url: job.url,
    datePosted: job.datePosted ?? "",
    endDate: job.endDate ?? "",
    recruiterName: job.recruiter?.name ?? "",
    recruiterEmail: job.recruiter?.email ?? "",
    recruiterPhone: job.recruiter?.phone ?? "",
    status: job.status ?? "new",
    fitScore: job.fitScore ?? "",
    capturedAt: job.capturedAt,
  };
}

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
