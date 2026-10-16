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

    // 1. Register user
    const regRes = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify({
        name: body.name,
        email: body.email,
        password: body.password,
      }),
    });

    const regData = await regRes.json();

    if (!regRes.ok) {
      if (regRes.status >= 500) {
        return NextResponse.json(
          {
            code: 'COMMON.INTERNAL_ERROR',
            message: 'Não foi possível concluir o cadastro. Tente novamente mais tarde.',
          },
          { status: regRes.status },
        );
      }
      return NextResponse.json(regData, { status: regRes.status });
    }

    // 2. Automatically log in to establish session
    const loginRes = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify({
        email: body.email,
        password: body.password,
      }),
    });

    const loginData = await loginRes.json();

    if (!loginRes.ok) {
      // Return registration data even if auto-login fails
      return NextResponse.json(regData, { status: 201 });
    }

    const { refreshToken, accessToken, user, expiresIn } = loginData.data;

    const response = NextResponse.json(
      {
        data: {
          user,
          accessToken,
          expiresIn,
        },
      },
      { status: 201 },
    );

    // Set HttpOnly refresh token cookie
    response.cookies.set(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions(IS_PRODUCTION));

    // Set session hint cookie
    response.cookies.set(LOGGED_IN_COOKIE_NAME, 'true', getLoggedInCookieOptions(IS_PRODUCTION));

    return response;
  } catch (error) {
    console.error('[Web BFF /api/auth/register] Internal error:', error);
    return NextResponse.json(
      {
        code: 'COMMON.INTERNAL_ERROR',
        message: 'Não foi possível concluir o cadastro. Tente novamente mais tarde.',
      },
      { status: 500 },
    );
  }
}
