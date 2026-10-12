import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  addCivilDays,
  isValidCivilDate,
  projectTaxComplianceCalendar,
  type TaxComplianceActionItem,
  type TaxComplianceCalendarEvent,
} from '@atlas/tax-engine';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';
import { GetTaxComplianceActionCenterUseCase } from './get-tax-compliance-action-center.use-case';
import { GetTaxComplianceRemindersUseCase } from './get-tax-compliance-reminders.use-case';

export interface GetTaxComplianceCalendarInput {
  readonly taxSubjectId: string;
  readonly calendarYear?: number;
  readonly from?: string;
  readonly to?: string;
  readonly eventType?: string;
  readonly status?: string;
}

export interface TaxComplianceCalendarResult {
  readonly events: readonly TaxComplianceCalendarEvent[];
  readonly from: string;
  readonly to: string;
  readonly totalCount: number;
}

/** Maximum calendar range: 24 months (744 days). Wider ranges fail closed. */
const MAX_CALENDAR_RANGE_DAYS = 744;

function firstDayOfMonth(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

function lastDayOfMonth(today: string): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const firstOfNext = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  const last = addCivilDays(firstOfNext, -1);
  if (last === null) {
    throw new BadRequestException('Unable to resolve calendar month bounds.');
  }
  return last;
}

function isWithinRange(from: string, to: string): boolean {
  const upper = addCivilDays(from, MAX_CALENDAR_RANGE_DAYS);
  return upper !== null && upper >= to;
}

/**
 * Projects calendar events over authoritative dates only (obligation due
 * dates, reminder trigger/effective dates, snoozed-until dates). No legal
 * date is ever inferred locally; the range is bounded to 24 months.
 */
@Injectable()
export class GetTaxComplianceCalendarUseCase {
  constructor(
    @Inject(GetTaxComplianceActionCenterUseCase)
    private readonly actionCenterUseCase: GetTaxComplianceActionCenterUseCase,
    @Inject(GetTaxComplianceRemindersUseCase)
    private readonly remindersUseCase: GetTaxComplianceRemindersUseCase,
    @Inject(FISCAL_CLOCK)
    private readonly clock: FiscalClock,
  ) {}

  async execute(input: GetTaxComplianceCalendarInput): Promise<TaxComplianceCalendarResult> {
    const today = this.clock.today();
    const from = input.from ?? firstDayOfMonth(today);
    const to = input.to ?? lastDayOfMonth(today);

    if (!isValidCivilDate(from) || !isValidCivilDate(to)) {
      throw new BadRequestException('from/to must be valid civil dates (YYYY-MM-DD).');
    }
    if (from > to) {
      throw new BadRequestException('from must not be after to.');
    }
    if (!isWithinRange(from, to)) {
      throw new BadRequestException('Calendar range must not exceed 24 months (744 days).');
    }

    // Reuse the same coherent snapshot path as the action center: full item
    // list (unpaginated here; calendar needs every in-range item) plus the
    // current reminder projection for event dates.
    const [center, reminderList] = await Promise.all([
      this.actionCenterUseCase.execute({
        taxSubjectId: input.taxSubjectId,
        calendarYear: input.calendarYear,
        limit: 200,
        offset: 0,
      }),
      this.remindersUseCase.execute({ taxSubjectId: input.taxSubjectId }),
    ]);

    // Calendar must cover every item, not just the first page: reload without
    // pagination bounds when the center overflows a single page.
    const allItems =
      center.totalCount > center.items.length
        ? await this.loadAllItems(input.taxSubjectId, input.calendarYear, center.totalCount)
        : [...center.items];

    const projection = projectTaxComplianceCalendar({
      taxSubjectId: input.taxSubjectId,
      items: allItems,
      reminders: reminderList.reminders,
      todayCivilDate: today,
      from,
      to,
    });

    let events = [...projection.events];
    if (input.eventType) {
      events = events.filter((event) => event.eventType === input.eventType);
    }
    if (input.status) {
      // ATTENTION is a presentation alias for the actionable set; every
      // member is a canonical upstream status (no fiscal interpretation).
      if (input.status === 'ATTENTION') {
        const attention = new Set([
          'OVERDUE',
          'DUE_TODAY',
          'ACTION_REQUIRED',
          'REQUIRES_REVIEW',
          'WAITING_USER',
        ]);
        events = events.filter((event) => attention.has(event.status));
      } else {
        events = events.filter((event) => event.status === input.status);
      }
    }

    return Object.freeze({
      events: Object.freeze(events),
      from,
      to,
      totalCount: events.length,
    });
  }

  private async loadAllItems(
    taxSubjectId: string,
    calendarYear: number | undefined,
    totalCount: number,
  ): Promise<TaxComplianceActionItem[]> {
    const pages: TaxComplianceActionItem[] = [];
    for (let offset = 0; offset < totalCount; offset += 200) {
      const page = await this.actionCenterUseCase.execute({
        taxSubjectId,
        calendarYear,
        limit: 200,
        offset,
      });
      pages.push(...page.items);
    }
    return pages;
  }
}
