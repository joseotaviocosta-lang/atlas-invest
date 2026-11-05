import React, { useState, useRef, useCallback, useEffect } from 'react';
import { colors, spacing } from '@atlas/ui';

export interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  disabled?: boolean;
}

const PULL_THRESHOLD = 60; // pixels to trigger refresh

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children,
  disabled = false,
}) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (disabled || isRefreshing) return;
      const target = containerRef.current;
      // Only initiate pull-to-refresh if scrolled at the very top
      if (target && target.scrollTop <= 0 && e.touches[0]) {
        touchStartY.current = e.touches[0].clientY;
        isDragging.current = true;
      }
    },
    [disabled, isRefreshing]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!isDragging.current || disabled || isRefreshing || !e.touches[0]) return;
      const currentY = e.touches[0].clientY;
      const deltaY = currentY - touchStartY.current;

      if (deltaY > 0) {
        // Apply friction
        const damped = Math.min(deltaY * 0.45, 90);
        setPullDistance(damped);
      } else {
        setPullDistance(0);
        isDragging.current = false;
      }
    },
    [disabled, isRefreshing]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(40); // hold at indicator height
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, isRefreshing, onRefresh]);

  // Clean up if unmounted during drag
  useEffect(() => {
    return () => {
      isDragging.current = false;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100%',
      }}
      data-testid="pull-to-refresh-container"
    >
      {/* Pull indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          data-testid="pull-to-refresh-indicator"
          style={{
            height: `${pullDistance}px`,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: `${spacing.xs}px`,
            color: colors.textSecondary,
            fontSize: '0.8125rem',
            fontWeight: 500,
            transition: isDragging.current ? 'none' : 'height 0.2s ease',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              transform: isRefreshing
                ? 'rotate(360deg)'
                : `rotate(${Math.min((pullDistance / PULL_THRESHOLD) * 180, 180)}deg)`,
              transition: isRefreshing ? 'transform 1s linear infinite' : 'transform 0.1s ease',
            }}
          >
            {isRefreshing ? '🔄' : '⬇️'}
          </span>
          <span>
            {isRefreshing
              ? 'Atualizando dados...'
              : pullDistance >= PULL_THRESHOLD
              ? 'Solte para atualizar'
              : 'Puxe para atualizar'}
          </span>
        </div>
      )}

      {children}
    </div>
  );
};
