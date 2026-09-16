import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/config';

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

    const apiRes = await fetch(`${API_BASE_URL}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify(body),
    });

    const resData = await apiRes.json();
    return NextResponse.json(resData, { status: apiRes.status });
  } catch (error) {
    return NextResponse.json(
      {
        code: 'COMMON.INTERNAL_ERROR',
        message: (error as Error).message || 'Failed to reset password',
      },
      { status: 500 },
    );
  }
}
