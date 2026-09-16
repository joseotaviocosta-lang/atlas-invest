'use client';

import React from 'react';
import { colors, borderRadius } from '@atlas/ui';

export interface AvatarProps {
  name?: string | null;
  size?: 'sm' | 'md' | 'lg';
  src?: string | null;
}

export function Avatar({ name, size = 'md', src }: AvatarProps) {
  const sizePx = size === 'sm' ? 32 : size === 'lg' ? 48 : 40;
  const fontSize = size === 'sm' ? '0.75rem' : size === 'lg' ? '1.125rem' : '0.875rem';

  const getInitials = (fullName?: string | null) => {
    if (!fullName || typeof fullName !== 'string') return 'A';
    const trimmed = fullName.trim();
    const parts = trimmed.split(/\s+/);
    const p0 = parts[0] || 'A';
    if (parts.length === 1) return p0.slice(0, 2).toUpperCase();
    const pLast = parts[parts.length - 1] || p0;
    return `${p0[0] || 'A'}${pLast[0] || ''}`.toUpperCase();
  };

  if (src) {
    return (
      <img
        src={src}
        alt={name || 'Avatar do investidor'}
        style={{
          width: `${sizePx}px`,
          height: `${sizePx}px`,
          borderRadius: `${borderRadius.pill}px`,
          objectFit: 'cover',
          border: `1px solid ${colors.border}`,
        }}
      />
    );
  }

  return (
    <div
      aria-label={name ? `Avatar de ${name}` : 'Avatar do investidor'}
      role="img"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${sizePx}px`,
        height: `${sizePx}px`,
        borderRadius: `${borderRadius.pill}px`,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        color: colors.accent,
        fontSize,
        fontWeight: 600,
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {getInitials(name)}
    </div>
  );
}
