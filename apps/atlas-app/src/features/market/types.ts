export interface MacroRateSeries {
  rate: string;
  formattedValue?: string;
  effectiveDate: string;
  effectiveDateFormatted?: string;
  source: string;
  freshness?: 'FRESH' | 'STALE';
  status?: 'AVAILABLE' | 'NO_DATA' | 'ERROR';
}

export interface MacroIpcaSeries {
  referenceMonth: string;
  referenceMonthFormatted?: string;
  value: string;
  formattedValue?: string;
  source: string;
  publishedAt?: string;
  freshness?: 'FRESH' | 'STALE';
  status?: 'AVAILABLE' | 'NO_DATA' | 'ERROR';
}

export interface MacroPtaxSeries {
  rate: string;
  value: string;
  effectiveDate: string;
  effectiveDateFormatted?: string;
  source: string;
  convention?: string;
  freshness?: 'FRESH' | 'STALE';
  status?: 'AVAILABLE' | 'NO_DATA' | 'ERROR';
}

export interface MacroIbovespaSeries {
  value: string;
  points?: string;
  formattedValue?: string;
  referenceDate?: string;
  referenceDateFormatted?: string;
  source?: string;
  freshness?: 'FRESH' | 'STALE';
  status: 'AVAILABLE' | 'OFFICIAL_SOURCE_UNAVAILABLE' | 'NO_DATA' | 'ERROR';
  message?: string;
}

export interface MacroContextResponse {
  data: {
    ipcaMonthly?: MacroIpcaSeries;
    selicTarget?: MacroRateSeries;
    selicEffective?: MacroRateSeries;
    ptax?: MacroPtaxSeries;
    ibovespa?: MacroIbovespaSeries;
  };
}

export interface MacroIndicatorCard {
  id: string;
  label: string;
  value: string;
  subValue: string;
  isPlaceholder: boolean;
}
