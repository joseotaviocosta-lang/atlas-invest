import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL, IS_PRODUCTION } from '@/lib/config';
import {
  REFRESH_COOKIE_NAME,
  LOGGED_IN_COOKIE_NAME,
  getRefreshCookieOptions,
  getLoggedInCookieOptions,
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
    const body = await req.json();

    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const userAgent = req.headers.get('user-agent');
    if (userAgent) forwardHeaders['user-agent'] = userAgent;

    const forwardedFor = req.headers.get('x-forwarded-for');
    if (forwardedFor) forwardHeaders['x-forwarded-for'] = forwardedFor;

    const apiRes = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify(body),
    });

    const resData = await apiRes.json();

    if (!apiRes.ok) {
      if (apiRes.status >= 500) {
        return NextResponse.json(
          {
            code: 'COMMON.INTERNAL_ERROR',
            message: 'Não foi possível concluir a autenticação. Tente novamente mais tarde.',
          },
          { status: apiRes.status },
        );
      }
      return NextResponse.json(resData, { status: apiRes.status });
    }

    const { refreshToken, accessToken, user, expiresIn } = resData.data;

    // Build client response with refreshToken strictly stripped out
    const response = NextResponse.json(
      {
        data: {
          user,
          accessToken,
          expiresIn,
        },
      },
      { status: 200 },
    );

    // Set HttpOnly refresh token cookie
    response.cookies.set(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions(IS_PRODUCTION));

    // Set session hint cookie
    response.cookies.set(LOGGED_IN_COOKIE_NAME, 'true', getLoggedInCookieOptions(IS_PRODUCTION));

    return response;
  } catch (error) {
    console.error('[Web BFF /api/auth/login] Internal error:', error);
    return NextResponse.json(
      {
        code: 'COMMON.INTERNAL_ERROR',
        message: 'Não foi possível concluir a autenticação. Tente novamente mais tarde.',
      },
      { status: 500 },
    );
  }
}
