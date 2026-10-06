/**
 * Escapes a cell value for standard CSV with semicolon delimiter.
 *
 * Shared, pure OWASP CSV-injection-safe escaper used by every annual-irpf
 * CSV exporter (4H annual-tax-reporting and 4I.6 high-income review package).
 * Behavior is byte-for-byte identical to the previously private copy in
 * `annual-tax-reporting-export.ts`.
 */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  let str = String(val);
  // Formula injection defense (OWASP CSV injection: =, +, -, @, \t, \r)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
