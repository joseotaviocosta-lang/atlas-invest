import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/config';
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

    const apiRes = await fetch(`${API_BASE_URL}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify(body),
    });

    const resData = await apiRes.json();
    if (!apiRes.ok && apiRes.status >= 500) {
      return NextResponse.json(
        {
          code: 'COMMON.INTERNAL_ERROR',
          message: 'Não foi possível solicitar a redefinição de senha. Tente novamente mais tarde.',
        },
        { status: apiRes.status },
      );
    }
    return NextResponse.json(resData, { status: apiRes.status });
  } catch (error) {
    console.error('[Web BFF /api/auth/forgot-password] Internal error:', error);
    return NextResponse.json(
      {
        code: 'COMMON.INTERNAL_ERROR',
        message: 'Não foi possível solicitar a redefinição de senha. Tente novamente mais tarde.',
      },
      { status: 500 },
    );
  }
}
