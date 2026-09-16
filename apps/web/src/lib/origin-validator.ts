export interface OriginValidationError {
  code: 'AUTH.INVALID_ORIGIN';
  message: string;
  status: 403;
}

export interface OriginValidationResult {
  isValid: boolean;
  error?: OriginValidationError;
}

export interface RequestWithHeaders {
  headers: {
    get(name: string): string | null;
  };
}

/**
 * Validates the Origin (or Referer as fallback) of incoming mutating requests.
 * Protects against cross-site request forgery and incompatible origins.
 *
 * Rules:
 * 1. If Origin header is present:
 *    - Must match host / x-forwarded-host.
 *    - Returns 403 Forbidden with code AUTH.INVALID_ORIGIN if mismatched.
 * 2. If Origin header is absent:
 *    - Falls back to checking Referer header host if present.
 *    - If both Origin and Referer are absent: allowed for non-browser clients (documented).
 */
export function validateOrigin(req: RequestWithHeaders): OriginValidationResult {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');

  if (!origin) {
    const referer = req.headers.get('referer');
    if (referer) {
      try {
        const refererHost = new URL(referer).host;
        if (host && refererHost !== host) {
          return {
            isValid: false,
            error: {
              code: 'AUTH.INVALID_ORIGIN',
              message: `Forbidden: Incompatible referer host '${refererHost}' for host '${host}'.`,
              status: 403,
            },
          };
        }
        return { isValid: true };
      } catch {
        return {
          isValid: false,
          error: {
            code: 'AUTH.INVALID_ORIGIN',
            message: 'Forbidden: Malformed Referer header.',
            status: 403,
          },
        };
      }
    }

    // Missing Origin and Referer:
    // Permitted for direct non-browser requests / internal calls (documented behavior).
    return { isValid: true };
  }

  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host;

    if (host && originHost !== host) {
      return {
        isValid: false,
        error: {
          code: 'AUTH.INVALID_ORIGIN',
          message: `Forbidden: Incompatible origin '${origin}' for host '${host}'.`,
          status: 403,
        },
      };
    }

    return { isValid: true };
  } catch {
    return {
      isValid: false,
      error: {
        code: 'AUTH.INVALID_ORIGIN',
        message: 'Forbidden: Malformed Origin header.',
        status: 403,
      },
    };
  }
}
