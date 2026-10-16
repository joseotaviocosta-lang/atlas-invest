import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL, IS_PRODUCTION } from '@/lib/config';
import {
  REFRESH_COOKIE_NAME,
  LOGGED_IN_COOKIE_NAME,
  getRefreshCookieOptions,
  getLoggedInCookieOptions,
  getClearedCookieOptions,
} from '@/lib/auth-cookie';
import { validateOrigin } from '@/lib/origin-validator';

export async function POST(req: NextRequest) {
  const originValidation = validateOrigin(req);
  if (!originValidation.isValid && originValidation.error) {
    return NextResponse.json(
      { code: originValidation.error.code, message: originValidation.error.message },
      { status: originValidation.error.status },
    );
  }

  try {
    const refreshToken = req.cookies.get(REFRESH_COOKIE_NAME)?.value;

    if (!refreshToken) {
      const response = NextResponse.json(
        {
          code: 'AUTH.MISSING_REFRESH_TOKEN',
          message: 'No active session or refresh token found.',
        },
        { status: 401 },
      );
      response.cookies.set(REFRESH_COOKIE_NAME, '', getClearedCookieOptions());
      response.cookies.set(LOGGED_IN_COOKIE_NAME, '', getClearedCookieOptions());
      return response;
    }

    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const userAgent = req.headers.get('user-agent');
    if (userAgent) forwardHeaders['user-agent'] = userAgent;

    const forwardedFor = req.headers.get('x-forwarded-for');
    if (forwardedFor) forwardHeaders['x-forwarded-for'] = forwardedFor;

    const apiRes = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify({ refreshToken }),
    });

    const resData = await apiRes.json();

    if (!apiRes.ok) {
      // Rotation failed or token revoked: purge session cookies immediately
      const response =
        apiRes.status >= 500
          ? NextResponse.json(
              {
                code: 'COMMON.INTERNAL_ERROR',
                message: 'Não foi possível renovar a sessão. Tente novamente.',
              },
              { status: apiRes.status },
            )
          : NextResponse.json(resData, { status: apiRes.status });
      response.cookies.set(REFRESH_COOKIE_NAME, '', getClearedCookieOptions());
      response.cookies.set(LOGGED_IN_COOKIE_NAME, '', getClearedCookieOptions());
      return response;
    }

    const { refreshToken: newRefreshToken, accessToken, expiresIn } = resData.data;

    const response = NextResponse.json(
      {
        data: {
          accessToken,
          expiresIn,
        },
      },
      { status: 200 },
    );

    // Update rotated HttpOnly refresh cookie
    response.cookies.set(
      REFRESH_COOKIE_NAME,
      newRefreshToken,
      getRefreshCookieOptions(IS_PRODUCTION),
    );

    // Refresh session hint cookie
    response.cookies.set(LOGGED_IN_COOKIE_NAME, 'true', getLoggedInCookieOptions(IS_PRODUCTION));

    return response;
  } catch (error) {
    console.error('[Web BFF /api/auth/refresh] Internal error:', error);
    const response = NextResponse.json(
      {
        code: 'COMMON.INTERNAL_ERROR',
        message: 'Não foi possível renovar a sessão. Tente novamente.',
      },
      { status: 500 },
    );
    return response;
  }
}
