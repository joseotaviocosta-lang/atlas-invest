import { LocalDate } from '@atlas/domain';

export class DateConverter {
  static toPersistence(localDate: LocalDate | undefined | null): Date | null {
    if (!localDate) return null;
    const parts = localDate.toString().split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    return new Date(Date.UTC(year, month - 1, day));
  }

  static toDomain(date: Date | string | undefined | null): LocalDate | null {
    if (!date) return null;
    if (typeof date === 'string') {
      return LocalDate.from(date.slice(0, 10));
    }
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return LocalDate.from(`${year}-${month}-${day}`);
  }
}
