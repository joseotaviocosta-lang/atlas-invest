import { InvalidLocalDateError } from '../errors/domain-error';

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function getDaysInMonth(year: number, month: number): number {
  switch (month) {
    case 1: // January
    case 3: // March
    case 5: // May
    case 7: // July
    case 8: // August
    case 10: // October
    case 12: // December
      return 31;
    case 4: // April
    case 6: // June
    case 9: // September
    case 11: // November
      return 30;
    case 2: // February
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

export class LocalDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  private readonly _iso: string;

  private constructor(year: number, month: number, day: number, iso: string) {
    this.year = year;
    this.month = month;
    this.day = day;
    this._iso = iso;
    Object.freeze(this);
  }

  static from(dateStr: string): LocalDate {
    if (typeof dateStr !== 'string') {
      throw new InvalidLocalDateError(`Expected string for LocalDate, got ${typeof dateStr}`);
    }

    const match = ISO_DATE_REGEX.exec(dateStr.trim());
    if (!match) {
      throw new InvalidLocalDateError(
        `Invalid date format '${dateStr}'. Expected strict 'YYYY-MM-DD'`,
      );
    }

    const year = parseInt(match[1]!, 10);
    const month = parseInt(match[2]!, 10);
    const day = parseInt(match[3]!, 10);

    if (month < 1 || month > 12) {
      throw new InvalidLocalDateError(
        `Invalid month '${month}' in date '${dateStr}'. Must be between 01 and 12`,
      );
    }

    const maxDays = getDaysInMonth(year, month);
    if (day < 1 || day > maxDays) {
      throw new InvalidLocalDateError(
        `Invalid day '${day}' for month '${month}' in year '${year}'. Valid range: 01 to ${maxDays}`,
      );
    }

    return new LocalDate(year, month, day, dateStr.trim());
  }

  static fromParts(year: number, month: number, day: number): LocalDate {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return LocalDate.from(`${year}-${pad(month)}-${pad(day)}`);
  }

  compare(other: LocalDate): -1 | 0 | 1 {
    if (this._iso < other._iso) return -1;
    if (this._iso > other._iso) return 1;
    return 0;
  }

  equals(other: LocalDate): boolean {
    return this._iso === other._iso;
  }

  isBefore(other: LocalDate): boolean {
    return this.compare(other) < 0;
  }

  isAfter(other: LocalDate): boolean {
    return this.compare(other) > 0;
  }

  toString(): string {
    return this._iso;
  }

  toJSON(): string {
    return this._iso;
  }

  static fromJSON(json: string): LocalDate {
    return LocalDate.from(json);
  }
}
