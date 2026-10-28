'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Badge, Button, Chip, Skeleton } from '@/components/ui';
import {
  colors,
  borderRadius,
  spacing,
  mapToNotificationCenterVM,
  type NotificationCenterResponseDto,
  type NotificationCategory,
} from '@atlas/ui';

export function NotificationCenterPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'ACTION_REQUIRED' | NotificationCategory>('ALL');
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch unified notification feed
  const { data: rawData, isLoading, isError, refetch } = useQuery({
    queryKey: ['notifications-feed'],
    queryFn: async () => {
      const res = await apiClient.get<NotificationCenterResponseDto>('/api/v1/notifications?limit=30');
      return res;
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const centerVM = mapToNotificationCenterVM(rawData);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on ESC
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const filteredNotifications = centerVM.notifications.filter((n) => {
    if (selectedFilter === 'ALL') return true;
    if (selectedFilter === 'ACTION_REQUIRED') return n.isActionRequired;
    return n.category === selectedFilter;
  });

  const badgeCount = centerVM.actionRequiredCount;
  const isUrgent = centerVM.urgentCount > 0;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={
          badgeCount > 0
            ? `Notificações: ${badgeCount} ${badgeCount === 1 ? 'item requer' : 'itens requerem'} sua atenção`
            : 'Notificações: nenhuma pendência'
        }
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="Central de Notificações"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: `${spacing.sm}px`,
          fontSize: '0.8125rem',
          color: colors.textSecondary,
          padding: '0.375rem 0.75rem',
          borderRadius: `${borderRadius.md}px`,
          backgroundColor: isOpen ? colors.surfaceHover : colors.surfaceElevated,
          border: `1px solid ${isOpen ? colors.accent : colors.border}`,
          minHeight: 44,
          cursor: 'pointer',
          transition: 'border-color 0.15s ease, background-color 0.15s ease',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: '1rem' }}>
          🔔
        </span>
        <span className="profile-label" style={{ fontWeight: 500, color: colors.textPrimary }}>
          Alertas
        </span>
        {badgeCount > 0 ? (
          <Badge variant={isUrgent ? 'danger' : 'warning'}>{String(badgeCount)}</Badge>
        ) : null}
      </button>

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Central de Notificações do Investidor"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '380px',
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: '520px',
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${borderRadius.lg}px`,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: `${spacing.md}px ${spacing.base}px`,
              borderBottom: `1px solid ${colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: colors.surfaceElevated,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
              <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: colors.textPrimary }}>
                Notificações
              </span>
              {centerVM.totalCount > 0 && (
                <Badge variant={isUrgent ? 'danger' : 'info'}>{centerVM.totalCount}</Badge>
              )}
            </div>

            <button
              onClick={() => setIsOpen(false)}
              aria-label="Fechar notificações"
              style={{
                background: 'transparent',
                border: 'none',
                color: colors.textSecondary,
                cursor: 'pointer',
                fontSize: '1.125rem',
                padding: '2px 6px',
                borderRadius: `${borderRadius.sm}px`,
              }}
            >
              ✕
            </button>
          </div>

          {/* Filter Chips */}
          <div
            style={{
              display: 'flex',
              gap: `${spacing.xs}px`,
              padding: `${spacing.sm}px ${spacing.base}px`,
              borderBottom: `1px solid ${colors.border}`,
              overflowX: 'auto',
              backgroundColor: colors.surface,
            }}
          >
            <Chip
              label="Todas"
              selected={selectedFilter === 'ALL'}
              onClick={() => setSelectedFilter('ALL')}
            />
            {centerVM.actionRequiredCount > 0 && (
              <Chip
                label={`Ação (${centerVM.actionRequiredCount})`}
                selected={selectedFilter === 'ACTION_REQUIRED'}
                onClick={() => setSelectedFilter('ACTION_REQUIRED')}
              />
            )}
            {centerVM.availableCategories.map((cat) => (
              <Chip
                key={cat}
                label={cat === 'FISCAL' ? 'Fiscal' : cat === 'REVIEW' ? 'Revisão' : cat === 'IMPORT' ? 'Importação' : cat}
                selected={selectedFilter === cat}
                onClick={() => setSelectedFilter(cat)}
              />
            ))}
          </div>

          {/* Notifications List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: `${spacing.sm}px 0`,
            }}
          >
            {isLoading ? (
              <div style={{ padding: `${spacing.base}px`, display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
                <Skeleton width="100%" height="60px" />
                <Skeleton width="100%" height="60px" />
                <Skeleton width="100%" height="60px" />
              </div>
            ) : isError ? (
              <div style={{ padding: `${spacing.base}px`, textAlign: 'center' }}>
                <p style={{ color: colors.negative, fontSize: '0.8125rem', marginBottom: `${spacing.sm}px` }}>
                  Não foi possível carregar as notificações.
                </p>
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div style={{ padding: `${spacing.xl}px ${spacing.base}px`, textAlign: 'center' }}>
                <span style={{ fontSize: '1.75rem', display: 'block', marginBottom: `${spacing.sm}px` }}>
                  ✓
                </span>
                <p style={{ color: colors.textPrimary, fontSize: '0.875rem', fontWeight: 500, margin: 0 }}>
                  Nenhuma pendência ou alerta
                </p>
                <p style={{ color: colors.textSecondary, fontSize: '0.75rem', marginTop: `${spacing.xs}px` }}>
                  {selectedFilter === 'ALL'
                    ? 'Tudo em dia nas suas carteiras e obrigações fiscais.'
                    : 'Nenhum alerta encontrado para o filtro selecionado.'}
                </p>
              </div>
            ) : (
              filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  style={{
                    padding: `${spacing.md}px ${spacing.base}px`,
                    borderBottom: `1px solid ${colors.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: `${spacing.xs}px`,
                    backgroundColor: notification.isUrgent ? 'rgba(239, 68, 68, 0.04)' : 'transparent',
                    transition: 'background-color 0.1s ease',
                  }}
                >
                  {/* Item Header: Badges & Date */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: `${spacing.xs}px` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px`, flexWrap: 'wrap' }}>
                      <Badge variant={notification.priorityBadgeVariant}>
                        {notification.priorityLabel}
                      </Badge>
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          color: colors.textSecondary,
                          backgroundColor: colors.surfaceElevated,
                          padding: '1px 6px',
                          borderRadius: `${borderRadius.sm}px`,
                        }}
                      >
                        {notification.categoryLabel}
                      </span>
                      {notification.portfolioName && (
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            color: colors.textSecondary,
                            maxWidth: '120px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          · {notification.portfolioName}
                        </span>
                      )}
                    </div>

                    <span style={{ fontSize: '0.6875rem', color: colors.textSecondary, flexShrink: 0 }}>
                      {notification.formattedDueAt ? `Vence: ${notification.formattedDueAt}` : notification.formattedOccurredAt}
                    </span>
                  </div>

                  {/* Title */}
                  <div
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color: colors.textPrimary,
                      marginTop: '2px',
                    }}
                  >
                    {notification.title}
                  </div>

                  {/* Description */}
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: colors.textSecondary,
                      lineHeight: 1.4,
                    }}
                  >
                    {notification.description}
                  </div>

                  {/* Action Link Button */}
                  <div style={{ marginTop: `${spacing.xs}px`, alignSelf: 'flex-start' }}>
                    <Link
                      href={notification.actionHref}
                      onClick={() => setIsOpen(false)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: colors.accent,
                        textDecoration: 'none',
                        padding: '3px 8px',
                        backgroundColor: 'rgba(56, 189, 248, 0.08)',
                        borderRadius: `${borderRadius.sm}px`,
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                      }}
                    >
                      {notification.actionLabel} →
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
