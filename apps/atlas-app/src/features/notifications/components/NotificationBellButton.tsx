import React, { useState } from 'react';
import { useNotifications } from '../NotificationProvider';
import { NotificationCenterModal } from './NotificationCenterModal';
import { colors, borderRadius } from '@atlas/ui';

export const NotificationBellButton: React.FC = () => {
  const { unreadCount } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Central de Notificações"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 38,
          height: 38,
          borderRadius: borderRadius.md,
          backgroundColor: 'transparent',
          border: `1px solid ${colors.border}`,
          color: colors.textPrimary,
          cursor: 'pointer',
          transition: 'background-color 0.2s',
        }}
      >
        <span style={{ fontSize: '1.125rem' }}>🔔</span>
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              padding: '0 4px',
              borderRadius: 9,
              backgroundColor: colors.negative || '#EF4444',
              color: '#FFFFFF',
              fontSize: '0.6875rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationCenterModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};
