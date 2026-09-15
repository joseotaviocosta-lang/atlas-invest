import React from 'react';

export default function HomePage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <div
        style={{
          border: '1px solid #232936',
          borderRadius: '12px',
          padding: '3rem 4rem',
          backgroundColor: '#151A23',
          maxWidth: '500px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}
      >
        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: 'bold',
            marginBottom: '0.75rem',
            letterSpacing: '-0.02em',
          }}
        >
          Project Atlas
        </h1>
        <p
          style={{
            fontSize: '1.25rem',
            color: '#10B981',
            fontWeight: 600,
            marginBottom: '1.5rem',
          }}
        >
          Foundation Ready
        </p>
        <p
          style={{
            fontSize: '0.875rem',
            color: '#9CA3AF',
            margin: 0,
          }}
        >
          API Target: <code style={{ color: '#0A84FF' }}>{apiUrl}</code>
        </p>
      </div>
    </main>
  );
}
