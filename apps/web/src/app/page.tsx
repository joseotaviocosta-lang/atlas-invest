'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { colors } from '@atlas/ui';

export default function RootPage() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/today');
    } else if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: colors.background,
      }}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          border: `3px solid ${colors.border}`,
          borderRadius: '50%',
          borderTopColor: colors.accent,
          animation: 'spin 0.6s linear infinite',
        }}
      />
    </div>
  );
}
