import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../NotificationProvider';
import { Modal, Button, Badge, EmptyState } from '../../../components/ui';
import { colors, spacing, borderRadius } from '@atlas/ui';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { history, markAsRead, markAllAsRead, clearHistory } = useNotifications();
  const navigate = useNavigate();

  const handleActionClick = (deepLink?: string, id?: string) => {
    if (id) {
      markAsRead(id);
    }
    onClose();
    if (deepLink) {
      navigate(deepLink);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Central de Notificações" maxWidth="600px">
      <div style={{ padding: spacing.md }}>
        {/* Controls Header */}
        {history.length > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: spacing.md,
              paddingBottom: spacing.sm,
              borderBottom: `1px solid ${colors.border}`,
            }}
          >
            <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              {history.length} {history.length === 1 ? 'notificação recente' : 'notificações recentes'}
            </span>
            <div style={{ display: 'flex', gap: spacing.sm }}>
              <Button size="sm" variant="outline" onClick={markAllAsRead}>
                Marcar lidas
              </Button>
              <Button size="sm" variant="outline" onClick={clearHistory}>
                Limpar
              </Button>
            </div>
          </div>
        )}

        {/* Notification List */}
        {history.length === 0 ? (
          <EmptyState
            title="Nenhuma notificação"
            description="Você não possui lembretes fiscais ou pendências de conciliação ativas no momento."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {history.map(({ id, notification, read, receivedAt }) => (
              <div
                key={id}
                style={{
                  padding: spacing.md,
                  backgroundColor: read ? colors.surface : colors.surfaceHover,
                  border: `1px solid ${read ? colors.border : colors.accent}`,
                  borderRadius: borderRadius.md,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: spacing.xs,
                  transition: 'background-color 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                    {!read && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: colors.accent,
                          display: 'inline-block',
                        }}
                      />
                    )}
                    <span style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.9375rem' }}>
                      {notification.title}
                    </span>
                  </div>
                  <Badge variant={notification.severity === 'HIGH' ? 'danger' : 'info'}>
                    {notification.severity}
                  </Badge>
                </div>

                <p style={{ margin: '4px 0 8px 0', fontSize: '0.8125rem', color: colors.textSecondary, lineHeight: 1.4 }}>
                  {notification.body}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                    {new Date(receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  {notification.deepLink && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleActionClick(notification.deepLink, id)}
                    >
                      Ver no App
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
