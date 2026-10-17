import { detectDelimiter, parseCsv } from '@/lib/csv';
import type { ImportUser } from '@/types/admin';

export const MAX_IMPORT_ROWS = 500; // contract 5.1
export const MAX_IMPORT_FILE_BYTES = 1024 * 1024;

export const IMPORT_COLUMNS = ['email', 'role', 'name', 'cgpa', 'branch', 'passingYear', 'backlogs'] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
const REQUIRED: ImportColumn[] = ['email', 'role'];
const ACADEMIC: ImportColumn[] = ['cgpa', 'branch', 'passingYear', 'backlogs'];

export const TEMPLATE_CSV = [
  IMPORT_COLUMNS.join(','),
  'aarav.sharma@college.edu,APPLICANT,Aarav Sharma,8.4,Computer Science,2026,0',
  'hr@acme.com,COMPANY,Acme Tech,,,,',
].join('\r\n');

// header spelling is forgiving: "Passing Year", "passing_year" and "passingYear" are the same column
const ALIASES: Record<string, ImportColumn> = {
  email: 'email',
  role: 'role',
  name: 'name',
  cgpa: 'cgpa',
  branch: 'branch',
  passingyear: 'passingYear',
  backlogs: 'backlogs',
};
const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/[\s_-]+/g, '');

export interface ImportRow {
  line: number; // row number in the spreadsheet (the header is row 1)
  values: Record<ImportColumn, string>;
  user: ImportUser | null; // null = has errors, not sent
  errors: string[];
  warnings: string[];
}

export interface ParsedImport {
  rows: ImportRow[];
  fileError: string | null;
  ignoredColumns: string[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toNumber(value: string): number {
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
}

function validateRow(
  cells: string[],
  line: number,
  columns: (ImportColumn | null)[],
  seen: Map<string, number>,
): ImportRow {
  const values = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, ''])) as Record<ImportColumn, string>;
  columns.forEach((column, i) => {
    if (column) values[column] = (cells[i] ?? '').trim();
  });

  const errors: string[] = [];
  const warnings: string[] = [];
  if (cells.length > columns.length) errors.push('Has more values than columns (check for an unquoted comma)');

  const email = values.email.toLowerCase();
  if (!email) errors.push('Email is required');
  else if (email.length > 254 || !EMAIL.test(email)) errors.push('Email is not valid');
  else if (seen.has(email)) errors.push(`Same email as row ${seen.get(email)}`);
  else seen.set(email, line);

  const role = values.role.toUpperCase();
  if (role !== 'APPLICANT' && role !== 'COMPANY') errors.push('Role must be APPLICANT or COMPANY');

  if (values.name.length > 100) errors.push('Name is too long (max 100 characters)');

  const user: ImportUser = { email, role: role as ImportUser['role'] };
  if (values.name) user.name = values.name;

  const isApplicant = role === 'APPLICANT';
  if (!isApplicant && role === 'COMPANY' && ACADEMIC.some((c) => values[c])) {
    warnings.push('Academic columns are only used for applicants, so they are ignored');
  }

  if (isApplicant) {
    if (values.cgpa) {
      const cgpa = toNumber(values.cgpa);
      if (Number.isNaN(cgpa) || cgpa > 100) errors.push('CGPA must be a number between 0 and 10');
      else {
        user.cgpa = cgpa;
        if (cgpa > 10) warnings.push(`CGPA ${cgpa} is read as a percentage (${cgpa / 10} out of 10)`);
      }
    }
    if (values.branch) {
      if (values.branch.length > 100) errors.push('Branch is too long (max 100 characters)');
      else user.branch = values.branch;
    }
    if (values.passingYear) {
      const year = toNumber(values.passingYear);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.push('Passing year must be a year like 2026');
      else user.passingYear = year;
    }
    if (values.backlogs) {
      const backlogs = toNumber(values.backlogs);
      if (!Number.isInteger(backlogs) || backlogs > 50) errors.push('Backlogs must be a whole number (0 to 50)');
      else user.backlogs = backlogs;
    }
  }

  return { line, values, user: errors.length === 0 ? user : null, errors, warnings };
}

/** Reads and validates the whole file. Never throws: problems come back as fileError or as row errors. */
export function parseImportCsv(text: string): ParsedImport {
  const fail = (fileError: string): ParsedImport => ({ rows: [], fileError, ignoredColumns: [] });

  const { rows: table, unterminated } = parseCsv(text, detectDelimiter(text));
  if (unterminated) return fail('A quoted value is never closed. Look for a stray " in the file.');

  // keep the spreadsheet row numbers, then drop blank lines
  const numbered = table.map((cells, i) => ({ cells, line: i + 1 })).filter((r) => r.cells.some((c) => c.trim() !== ''));
  if (numbered.length === 0) return fail('The file is empty.');

  const [head, ...body] = numbered;
  const columns = head.cells.map((h) => ALIASES[normalizeHeader(h)] ?? null);
  const ignoredColumns = head.cells.filter((h, i) => columns[i] === null && h.trim() !== '');

  const missing = REQUIRED.filter((c) => !columns.includes(c));
  if (missing.length > 0) {
    return fail(
      `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Download the template to see the expected header.`,
    );
  }
  if (body.length === 0) return fail('The file has a header but no users.');
  if (body.length > MAX_IMPORT_ROWS) {
    return fail(`The file has ${body.length} rows. You can import at most ${MAX_IMPORT_ROWS} at a time, so split it into smaller files.`);
  }

  const seen = new Map<string, number>();
  return {
    rows: body.map(({ cells, line }) => validateRow(cells, line, columns, seen)),
    fileError: null,
    ignoredColumns,
  };
}