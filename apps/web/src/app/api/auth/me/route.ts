import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/config';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json(
        {
          code: 'AUTH.UNAUTHORIZED',
          message: 'Missing authorization header',
        },
        { status: 401 },
      );
    }

    const apiRes = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
    });

    const resData = await apiRes.json();
    return NextResponse.json(resData, { status: apiRes.status });
  } catch (error) {
    return NextResponse.json(
      {
        code: 'COMMON.INTERNAL_ERROR',
        message: (error as Error).message || 'Failed to fetch current user profile',
      },
      { status: 500 },
    );
  }
}
