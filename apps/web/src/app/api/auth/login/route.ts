import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL, IS_PRODUCTION } from '@/lib/config';
import {
  REFRESH_COOKIE_NAME,
  LOGGED_IN_COOKIE_NAME,
  getRefreshCookieOptions,
  getLoggedInCookieOptions,
} from '@/lib/auth-cookie';

export async function POST(req: NextRequest) {
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
    return NextResponse.json(
      {
        code: 'COMMON.INTERNAL_ERROR',
        message: (error as Error).message || 'Failed to authenticate',
      },
      { status: 500 },
    );
  }
}
