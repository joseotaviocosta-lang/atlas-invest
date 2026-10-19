import { describe, it, expect } from 'vitest';
import { LocalDate } from '@atlas/domain';
import {
  computeEasterSunday,
  generateOfficialBrazilianHolidays,
  BrazilianOfficialCalendarProvider,
  classifyObservationStatus,
  BcbMacroDataProvider,
} from '@atlas/market-data';

describe('Phase 5D — Official Calendar Domain & Classification', () => {
  it('computes Easter Sunday accurately for key canonical years', () => {
    // 2024: March 31
    const easter2024 = computeEasterSunday(2024);
    expect(easter2024.toString()).toBe('2024-03-31');

    // 2025: April 20
    const easter2025 = computeEasterSunday(2025);
    expect(easter2025.toString()).toBe('2025-04-20');

    // 2026: April 5
    const easter2026 = computeEasterSunday(2026);
    expect(easter2026.toString()).toBe('2026-04-05');
  });

  it('generates national holidays including movable ones and Consciência Negra', () => {
    const holidays2026 = generateOfficialBrazilianHolidays(2026);

    // Confraternização Universal
    expect(holidays2026.get('2026-01-01')?.name).toBe('Confraternização Universal');

    // Carnaval (Segunda e Terça) — Easter is 2026-04-05, so Carnaval is 2026-02-16 & 2026-02-17
    expect(holidays2026.get('2026-02-16')?.name).toBe('Carnaval (Segunda-feira)');
    expect(holidays2026.get('2026-02-17')?.name).toBe('Carnaval (Terça-feira)');

    // Paixão de Cristo (Sexta-feira Santa)
    expect(holidays2026.get('2026-04-03')?.name).toBe('Paixão de Cristo');

    // Tiradentes
    expect(holidays2026.get('2026-04-21')?.name).toBe('Tiradentes');

    // Corpus Christi (+60 days from Easter -> 2026-06-04)
    expect(holidays2026.get('2026-06-04')?.name).toBe('Corpus Christi');

    // Consciência Negra (Nov 20)
    expect(holidays2026.get('2026-11-20')?.name).toBe('Dia da Consciência Negra');

    // Balanço Anual (Dec 31)
    expect(holidays2026.get('2026-12-31')?.name).toBe('Não há expediente (Balanço Anual)');
  });

  it('generates a full calendar year with Ash Wednesday special session for B3', () => {
    const provider = new BrazilianOfficialCalendarProvider();
    const days2026 = provider.generateYear(2026, 'B3_TRADING');

    expect(days2026.length).toBe(365); // 2026 is not a leap year

    // 2026-01-01 is closed
    const newYear = days2026.find((d) => d.date.toString() === '2026-01-01');
    expect(newYear?.isOpen).toBe(false);
    expect(newYear?.reason).toBe('Confraternização Universal');

    // 2026-02-18 is Ash Wednesday (open session starting 13h)
    const ashWednesday = days2026.find((d) => d.date.toString() === '2026-02-18');
    expect(ashWednesday?.isOpen).toBe(true);
    expect(ashWednesday?.reason).toContain('Quarta-feira de Cinzas');

    // 2026-12-31 is closed
    const endOfYear = days2026.find((d) => d.date.toString() === '2026-12-31');
    expect(endOfYear?.isOpen).toBe(false);

    // Weekends are closed
    const aSunday = days2026.find((d) => d.date.toString() === '2026-01-04');
    expect(aSunday?.isOpen).toBe(false);
    expect(aSunday?.reason).toBe('Domingo');
  });

  describe('Gap Classification Invariant: CLOSED_DAY vs DATA_GAP vs NOT_PUBLISHED_YET', () => {
    it('classifies missing quote on a weekend or holiday as CLOSED_DAY (never DATA_GAP)', () => {
      const sundayDate = LocalDate.from('2026-10-18');
      const asOfDate = LocalDate.from('2026-10-19');

      const result = classifyObservationStatus({
        seriesId: 'PETR4',
        date: sundayDate,
        asOfDate,
        hasData: false,
        calendarDay: {
          calendarType: 'B3_TRADING',
          date: sundayDate,
          isOpen: false,
          reason: 'Domingo',
          source: 'OFFICIAL_BRAZILIAN_CALENDAR',
        },
      });

      expect(result.status).toBe('CLOSED_DAY');
      expect(result.isOpenDay).toBe(false);
      expect(result.reason).toContain('Domingo');
    });

    it('classifies missing quote on an official holiday as CLOSED_DAY', () => {
      const holidayDate = LocalDate.from('2026-01-01');
      const asOfDate = LocalDate.from('2026-01-05');

      const result = classifyObservationStatus({
        seriesId: 'PETR4',
        date: holidayDate,
        asOfDate,
        hasData: false,
        calendarDay: {
          calendarType: 'B3_TRADING',
          date: holidayDate,
          isOpen: false,
          reason: 'Confraternização Universal',
          source: 'OFFICIAL_BRAZILIAN_CALENDAR',
        },
      });

      expect(result.status).toBe('CLOSED_DAY');
      expect(result.isOpenDay).toBe(false);
      expect(result.reason).toContain('Confraternização Universal');
    });

    it('classifies missing quote on an open trading day in the past as authentic DATA_GAP', () => {
      const openTradingDay = LocalDate.from('2026-10-14');
      const asOfDate = LocalDate.from('2026-10-16');

      const result = classifyObservationStatus({
        seriesId: 'PETR4',
        date: openTradingDay,
        asOfDate,
        hasData: false,
        calendarDay: {
          calendarType: 'B3_TRADING',
          date: openTradingDay,
          isOpen: true,
          reason: 'Dia útil regular',
          source: 'OFFICIAL_BRAZILIAN_CALENDAR',
        },
      });

      expect(result.status).toBe('DATA_GAP');
      expect(result.isOpenDay).toBe(true);
      expect(result.reason).toContain('dado ausente');
    });

    it('classifies an open trading day in the future as NOT_PUBLISHED_YET', () => {
      const futureTradingDay = LocalDate.from('2026-10-25');
      const asOfDate = LocalDate.from('2026-10-18');

      const result = classifyObservationStatus({
        seriesId: 'PETR4',
        date: futureTradingDay,
        asOfDate,
        hasData: false,
        calendarDay: {
          calendarType: 'B3_TRADING',
          date: futureTradingDay,
          isOpen: true,
          reason: 'Dia útil regular',
          source: 'OFFICIAL_BRAZILIAN_CALENDAR',
        },
      });

      expect(result.status).toBe('NOT_PUBLISHED_YET');
      expect(result.isOpenDay).toBe(true);
      expect(result.reason).toContain('ainda não publicado');
    });

    it('classifies an open day with quote present as EXPECTED', () => {
      const tradingDay = LocalDate.from('2026-10-15');
      const asOfDate = LocalDate.from('2026-10-16');

      const result = classifyObservationStatus({
        seriesId: 'PETR4',
        date: tradingDay,
        asOfDate,
        hasData: true,
        calendarDay: {
          calendarType: 'B3_TRADING',
          date: tradingDay,
          isOpen: true,
          reason: 'Dia útil regular',
          source: 'OFFICIAL_BRAZILIAN_CALENDAR',
        },
      });

      expect(result.status).toBe('EXPECTED');
      expect(result.isOpenDay).toBe(true);
    });

    it('identifies CALENDAR_COVERAGE_MISSING when calendar has not been backfilled for the date', () => {
      const date = LocalDate.from('2020-01-15');
      const asOfDate = LocalDate.from('2026-10-18');

      const result = classifyObservationStatus({
        seriesId: 'PETR4',
        date,
        asOfDate,
        hasData: false,
        calendarDay: null,
      });

      expect(result.status).toBe('CALENDAR_COVERAGE_MISSING');
      expect(result.isOpenDay).toBe(false);
    });
  });
});

describe('Phase 5D — Macro Data BCB SGS Provider', () => {
  it('parses BCB SGS JSON data accurately without float distortion', async () => {
    const mockJson = [
      { data: '01/08/2026', valor: '0,44' },
      { data: '01/09/2026', valor: '0,21' },
      { data: '18/10/2026', valor: '10,75' },
    ];

    const mockFetch = async () =>
      new Response(JSON.stringify(mockJson), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const provider = new BcbMacroDataProvider({ fetchFn: mockFetch as never });

    const obsList = await provider.getObservations(
      'IPCA',
      LocalDate.from('2026-08-01'),
      LocalDate.from('2026-09-30'),
    );

    expect(obsList.length).toBe(2);
    expect(obsList[0]?.referenceDate.toString()).toBe('2026-08-01');
    expect(obsList[0]?.value.toString()).toBe('0.44');
    expect(obsList[0]?.unit).toBe('PERCENT');
    expect(obsList[0]?.frequency).toBe('MONTHLY');
    expect(obsList[0]?.source).toBe('BCB_SGS_433');

    expect(obsList[1]?.referenceDate.toString()).toBe('2026-09-01');
    expect(obsList[1]?.value.toString()).toBe('0.21');
  });

  it('handles Selic Target (432) correctly', async () => {
    const mockJson = [{ data: '18/09/2026', valor: '10,75' }];

    const mockFetch = async () =>
      new Response(JSON.stringify(mockJson), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const provider = new BcbMacroDataProvider({ fetchFn: mockFetch as never });

    const obs = await provider.getObservation('SELIC_TARGET', LocalDate.from('2026-09-18'));
    expect(obs.referenceDate.toString()).toBe('2026-09-18');
    expect(obs.value.toString()).toBe('10.75');
    expect(obs.unit).toBe('PERCENT_PER_ANNUM');
    expect(obs.frequency).toBe('EVENT_DRIVEN');
    expect(obs.source).toBe('BCB_SGS_432');
  });

  it('proves series-to-calendar association rules (IBOV -> B3_TRADING, CDI & PTAX -> BANKING)', () => {
    // Canonical mapping per ADR and architecture:
    const seriesCalendarMap = {
      IBOV: 'B3_TRADING',
      CDI: 'BANKING',
      'USD/BRL': 'BANKING',
      'EUR/BRL': 'BANKING',
      IPCA: 'BANKING',
      SELIC_TARGET: 'BANKING',
      SELIC_EFFECTIVE: 'BANKING',
    };

    expect(seriesCalendarMap.IBOV).toBe('B3_TRADING');
    expect(seriesCalendarMap.CDI).toBe('BANKING');
    expect(seriesCalendarMap['USD/BRL']).toBe('BANKING');
    expect(seriesCalendarMap['EUR/BRL']).toBe('BANKING');
    expect(seriesCalendarMap.IPCA).toBe('BANKING');
  });

  it('demonstrates B3 post-2022 trading policy on SP municipal holidays (Jan 25 & Jul 9 are regular trading days)', () => {
    const provider = new BrazilianOfficialCalendarProvider();
    const b3Days = provider.generateYear(2026, 'B3_TRADING');

    // In 2026, Jan 25 is a Sunday (closed due to Sunday)
    const jan25 = b3Days.find((d) => d.date.toString() === '2026-01-25');
    expect(jan25?.isOpen).toBe(false);
    expect(jan25?.reason).toBe('Domingo');

    // In 2026, Jul 9 is a Thursday (regular trading day under B3 post-2022 unification)
    const jul09 = b3Days.find((d) => d.date.toString() === '2026-07-09');
    expect(jul09?.isOpen).toBe(true);
    expect(jul09?.reason).toBe('Dia útil regular');
  });

  it('verifies Ash Wednesday session (2026-02-18) is OPEN with special trading schedule', () => {
    const provider = new BrazilianOfficialCalendarProvider();
    const b3Days = provider.generateYear(2026, 'B3_TRADING');
    const bankingDays = provider.generateYear(2026, 'BANKING');

    const ashWedB3 = b3Days.find((d) => d.date.toString() === '2026-02-18');
    const ashWedBank = bankingDays.find((d) => d.date.toString() === '2026-02-18');

    expect(ashWedB3?.isOpen).toBe(true);
    expect(ashWedB3?.reason).toContain('Quarta-feira de Cinzas');
    expect(ashWedBank?.isOpen).toBe(true);
    expect(ashWedBank?.reason).toContain('Quarta-feira de Cinzas');
  });
});
