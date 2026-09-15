import { Prisma } from '@prisma/client';

export class DecimalConverter {
  static toPersistence(value: string | null | undefined): Prisma.Decimal | null {
    if (value === null || value === undefined) return null;
    return new Prisma.Decimal(value);
  }

  static toCanonicalString(decimal: Prisma.Decimal | null | undefined): string | null {
    if (decimal === null || decimal === undefined) return null;
    return decimal.toString();
  }
}
