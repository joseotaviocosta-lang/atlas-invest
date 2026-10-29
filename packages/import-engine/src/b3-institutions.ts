/**
 * Canonical Brazilian institutions normalization and portfolio account resolution.
 * Maps verbose or variant B3 institution names to standard institutions and accounts.
 */

export interface KnownInstitutionSpec {
  canonicalName: string;
  aliases: string[];
}

export const KNOWN_B3_INSTITUTIONS: readonly KnownInstitutionSpec[] = Object.freeze([
  {
    canonicalName: 'XP Investimentos',
    aliases: [
      'XP INVESTIMENTOS CCTVM S/A.',
      'XP INVESTIMENTOS CCTVM S/A',
      'XP INVESTIMENTOS',
      'XP CCTVM',
      'XP',
    ],
  },
  {
    canonicalName: 'Nubank / NuInvest',
    aliases: [
      'NU INVESTIMENTOS S.A. - CTVM',
      'NU INVESTIMENTOS S/A - CTVM',
      'NU INVESTIMENTOS S.A.',
      'NU INVESTIMENTOS',
      'NU INVEST',
      'NUINVEST',
      'NUBANK',
      'EASYNVEST',
    ],
  },
  {
    canonicalName: 'Clear Corretora',
    aliases: [
      'CLEAR CORRETORA - GRUPO XP',
      'CLEAR CORRETORA',
      'CLEAR',
    ],
  },
  {
    canonicalName: 'Rico Investimentos',
    aliases: [
      'RICO INVESTIMENTOS - GRUPO XP',
      'RICO INVESTIMENTOS',
      'RICO',
    ],
  },
  {
    canonicalName: 'BTG Pactual',
    aliases: [
      'BTG PACTUAL CTVM S.A.',
      'BANCO BTG PACTUAL S/A',
      'BTG PACTUAL',
      'BTG',
    ],
  },
  {
    canonicalName: 'Inter DTVM',
    aliases: [
      'INTER DTVM LTDA',
      'BANCO INTER S.A.',
      'BANCO INTER',
      'INTER',
    ],
  },
  {
    canonicalName: 'Itaú Corretora',
    aliases: [
      'ITAU CV S/A',
      'ITAU CORRETORA DE VALORES S.A.',
      'ITAU CORRETORA',
      'ITAU',
      'ION',
    ],
  },
  {
    canonicalName: 'Ágora Investimentos',
    aliases: [
      'AGORA CTVM S/A',
      'AGORA INVESTIMENTOS',
      'AGORA',
      'BRADESCO S/A CTVM',
      'BRADESCO CORRETORA',
    ],
  },
  {
    canonicalName: 'Santander Corretora',
    aliases: [
      'SANTANDER CCVM S/A',
      'SANTANDER CORRETORA',
      'SANTANDER',
    ],
  },
  {
    canonicalName: 'Genial Investimentos',
    aliases: [
      'GENIAL INVESTIMENTOS CVM S.A.',
      'GENIAL INVESTIMENTOS',
      'GENIAL',
    ],
  },
  {
    canonicalName: 'Toro Investimentos',
    aliases: [
      'TORO CTVM LTDA',
      'TORO INVESTIMENTOS',
      'TORO',
    ],
  },
]);

/**
 * Normalizes a raw B3 institution string into a clean canonical display name.
 * If unrecognized, returns the trimmed raw label.
 */
export function normalizeB3InstitutionName(rawName: string): string {
  const trimmed = rawName.trim();
  if (!trimmed) return '';

  const upper = trimmed.toUpperCase();
  for (const inst of KNOWN_B3_INSTITUTIONS) {
    for (const alias of inst.aliases) {
      if (upper === alias.toUpperCase()) {
        return inst.canonicalName;
      }
    }
  }

  // Substring fallback for common patterns
  if (upper.includes('XP INVESTIMENTOS')) return 'XP Investimentos';
  if (upper.includes('NU INVEST') || upper.includes('NUINVEST') || upper.includes('NUBANK') || upper.includes('EASYNVEST')) {
    return 'Nubank / NuInvest';
  }
  if (upper.includes('CLEAR CORRETORA') || upper.includes('CLEAR')) return 'Clear Corretora';
  if (upper.includes('RICO INVESTIMENTOS') || upper.includes('RICO')) return 'Rico Investimentos';
  if (upper.includes('BTG PACTUAL')) return 'BTG Pactual';
  if (upper.includes('INTER DTVM') || upper.includes('BANCO INTER')) return 'Inter DTVM';

  return trimmed;
}

export interface AccountCandidateInfo {
  id: string;
  name: string;
  institutionId?: string;
  institutionName?: string;
}

/**
 * Matches a B3 institution label to accounts available in the portfolio.
 * - If exactly 1 account matches by institutionId or normalized name: returns that account.
 * - If multiple match: returns AMBIGUOUS with candidates.
 * - If none match: returns NOT_FOUND.
 */
export function matchAccountForB3Institution(
  rawInstitution: string | undefined,
  accounts: AccountCandidateInfo[],
  institutionCatalog?: Array<{ id: string; name: string }>,
): {
  resolution: 'RESOLVED' | 'AMBIGUOUS' | 'NOT_FOUND' | 'UNSPECIFIED';
  account: AccountCandidateInfo | null;
  candidates: AccountCandidateInfo[];
  normalizedInstitution: string;
  matchedInstitutionId: string | null;
} {
  if (!rawInstitution || rawInstitution.trim() === '') {
    return {
      resolution: 'UNSPECIFIED',
      account: null,
      candidates: [],
      normalizedInstitution: '',
      matchedInstitutionId: null,
    };
  }

  const normalizedInstitution = normalizeB3InstitutionName(rawInstitution);
  const normalizedLower = normalizedInstitution.toLowerCase();

  // Find corresponding institution in database catalog
  let matchedInstitutionId: string | null = null;
  if (institutionCatalog && institutionCatalog.length > 0) {
    const inst = institutionCatalog.find(
      (i) =>
        i.name.trim().toLowerCase() === normalizedLower ||
        normalizeB3InstitutionName(i.name).toLowerCase() === normalizedLower,
    );
    if (inst) {
      matchedInstitutionId = inst.id;
    }
  }

  if (accounts.length === 0) {
    return {
      resolution: 'NOT_FOUND',
      account: null,
      candidates: [],
      normalizedInstitution,
      matchedInstitutionId,
    };
  }

  // 1. Exact match on institutionId if known
  if (matchedInstitutionId) {
    const byInstitutionId = accounts.filter(
      (a) => a.institutionId === matchedInstitutionId,
    );
    if (byInstitutionId.length === 1) {
      return {
        resolution: 'RESOLVED',
        account: byInstitutionId[0]!,
        candidates: [],
        normalizedInstitution,
        matchedInstitutionId,
      };
    }
    if (byInstitutionId.length > 1) {
      return {
        resolution: 'AMBIGUOUS',
        account: null,
        candidates: byInstitutionId,
        normalizedInstitution,
        matchedInstitutionId,
      };
    }
  }

  // 2. Name contains or matches normalized institution
  const byName = accounts.filter((a) => {
    const accName = a.name.trim().toLowerCase();
    return (
      accName === normalizedLower ||
      accName.includes(normalizedLower) ||
      normalizedLower.includes(accName) ||
      (a.institutionName && a.institutionName.toLowerCase() === normalizedLower)
    );
  });

  if (byName.length === 1) {
    return {
      resolution: 'RESOLVED',
      account: byName[0]!,
      candidates: [],
      normalizedInstitution,
      matchedInstitutionId,
    };
  }

  if (byName.length > 1) {
    return {
      resolution: 'AMBIGUOUS',
      account: null,
      candidates: byName,
      normalizedInstitution,
      matchedInstitutionId,
    };
  }

  // If the portfolio has only 1 account in total and the label is unresolved:
  // We do NOT auto-assign silently unless the user chooses to or institution matches.
  return {
    resolution: 'NOT_FOUND',
    account: null,
    candidates: [],
    normalizedInstitution,
    matchedInstitutionId,
  };
}

