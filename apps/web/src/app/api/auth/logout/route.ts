import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/config';
import {
  REFRESH_COOKIE_NAME,
  LOGGED_IN_COOKIE_NAME,
  getClearedCookieOptions,
} from '@/lib/auth-cookie';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');

    if (authHeader) {
      // Call upstream logout endpoint to revoke session in database
      await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
      }).catch(() => {});
    }

    const response = NextResponse.json(
      {
        data: {
          success: true,
          message: 'Logged out successfully',
        },
      },
      { status: 200 },
    );

    // Clear session cookies
    response.cookies.set(REFRESH_COOKIE_NAME, '', getClearedCookieOptions());
    response.cookies.set(LOGGED_IN_COOKIE_NAME, '', getClearedCookieOptions());

    return response;
  } catch (error) {
    const response = NextResponse.json(
      {
        code: 'COMMON.INTERNAL_ERROR',
        message: (error as Error).message || 'Failed to logout',
      },
      { status: 500 },
    );
    response.cookies.set(REFRESH_COOKIE_NAME, '', getClearedCookieOptions());
    response.cookies.set(LOGGED_IN_COOKIE_NAME, '', getClearedCookieOptions());
    return response;
  }
}
