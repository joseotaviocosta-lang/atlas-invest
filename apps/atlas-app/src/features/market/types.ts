export interface MacroRateSeries {
  rate: string;
  effectiveDate: string;
  source: string;
}

export interface MacroIpcaSeries {
  referenceMonth: string;
  value: string;
  source: string;
  publishedAt?: string;
}

export interface MacroContextResponse {
  data: {
    ipcaMonthly?: MacroIpcaSeries;
    selicTarget?: MacroRateSeries;
    selicEffective?: MacroRateSeries;
  };
}

export interface MacroIndicatorCard {
  id: string;
  label: string;
  value: string;
  subValue: string;
  isPlaceholder: boolean;
}
