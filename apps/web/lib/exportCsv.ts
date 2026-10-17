export type CsvValue = string | number | null | undefined;

// a spreadsheet runs a cell that starts with one of these as a formula; the data can come from users
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(rows: T[], columns: { header: string; value: (row: T) => CsvValue }[]): string {
  const lines = [columns.map((c) => cell(c.header)), ...rows.map((row) => columns.map((c) => cell(c.value(row))))];
  return lines.map((line) => line.join(',')).join('\r\n');
}

/** Saves text as a .csv file (with a BOM, so that Excel reads UTF-8 names correctly). */
export function downloadCsv(fileName: string, csv: string) {
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export const todayStamp = () => new Date().toISOString().slice(0, 10);