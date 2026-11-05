import React from 'react';
import { colors, borderRadius } from '@atlas/ui';

export interface AvatarProps {
  name?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

export const Avatar: React.FC<AvatarProps> = ({ name, size = 'md' }) => {
  const getInitials = (val?: string | null): string => {
    if (!val || val === '--') return 'U';
    const parts = val.trim().split(/\s+/).filter(Boolean);
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (parts.length >= 2 && first && last && first[0] && last[0]) {
      return (first[0] + last[0]).toUpperCase();
    }
    return val.slice(0, 2).toUpperCase();
  };

  const getDimensions = () => {
    switch (size) {
      case 'sm':
        return { size: '28px', font: '0.6875rem' };
      case 'lg':
        return { size: '48px', font: '1.25rem' };
      case 'md':
      default:
        return { size: '36px', font: '0.875rem' };
    }
  };

  const { size: dim, font } = getDimensions();

  return (
    <div
      style={{
        width: dim,
        height: dim,
        borderRadius: `${borderRadius.full}px`,
        backgroundColor: colors.accent,
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: font,
        flexShrink: 0,
      }}
    >
      {getInitials(name)}
    </div>
  );
};
