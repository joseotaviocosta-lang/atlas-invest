/**
 * Phase 4D.2 — provider-neutral late-fee authority boundary.
 *
 * The pure calculation domain never performs network I/O (ADR-275). A concrete
 * official adapter (`SicalcLateFeeProvider`) lives in the application layer and
 * is used only in a controlled ingestion path; snapshots are persisted and the
 * engine consumes them.
 */
export interface LateFeeAuthorityRequest {
  readonly municipalityCode: string;
  readonly dueDate: string;
  readonly paymentDate: string;
  readonly principalAmount: string;
}

export interface LateFeeAuthorityFetchResult {
  readonly lateFeeAmount: string;
  readonly lateFeePercent: string;
  /** Official first business day after due, when the provider exposes it. */
  readonly startBusinessDate: string | null;
}

export interface LateFeeAuthorityProvider {
  readonly providerId: string;
  fetchLateFee(request: LateFeeAuthorityRequest): Promise<LateFeeAuthorityFetchResult>;
}

/**
 * Official Sicalc late-fee adapter. Calls the public RFB/Sicalc multa endpoint
 * (`/sicalc/api/multa/calcula/{municipio}/{due}/{pay}/{principal}`), which
 * already resolves the business-day-sensitive start via the official calendar.
 * No generic holiday calendar is implemented in Atlas.
 */
export class SicalcLateFeeProvider implements LateFeeAuthorityProvider {
  readonly providerId = 'SICALC';

  constructor(private readonly baseUrl: string = 'https://sicalc.receita.fazenda.gov.br/sicalc') {}

  async fetchLateFee(request: LateFeeAuthorityRequest): Promise<LateFeeAuthorityFetchResult> {
    const url =
      `${this.baseUrl}/api/multa/calcula/` +
      `${request.municipalityCode}/${request.dueDate}/${request.paymentDate}/${request.principalAmount}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Sicalc late-fee request failed with status ${response.status}`);
    }
    const body = (await response.json()) as {
      valor?: unknown;
      percentual?: unknown;
    };
    if (typeof body.valor !== 'string' || typeof body.percentual !== 'string') {
      throw new Error('Sicalc late-fee response is malformed');
    }
    return {
      lateFeeAmount: body.valor,
      lateFeePercent: body.percentual,
      startBusinessDate: null,
    };
  }
}
