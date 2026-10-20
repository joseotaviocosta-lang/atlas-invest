'use client';

/**
 * Phase 5H - Operator console presentation primitives.
 *
 * Badges always pair color with text and an aria-label, so state meaning
 * never relies on color alone. All values come from backend-provided
 * strings; no financial math happens here.
 */
import React from 'react';
import { Badge } from '@/components/ui';
import type { BadgeProps } from '@/components/ui';
import { reasonCodeCopy, type OperationalState } from '@/api/operations';

const STATE_VARIANT: Record<OperationalState, BadgeProps['variant']> = {
  HEALTHY: 'positive',
  DEGRADED: 'warning',
  STALE: 'warning',
  FAILED: 'danger',
  UNKNOWN: 'neutral',
  DISABLED: 'info',
};

const STATE_ICON: Record<OperationalState, string> = {
  HEALTHY: '●',
  DEGRADED: '◐',
  STALE: '◑',
  FAILED: '■',
  UNKNOWN: '?',
  DISABLED: '○',
};

export function OperationalStateBadge({ state }: { state: string }) {
  const normalized = (state as OperationalState) ?? 'UNKNOWN';
  const variant = STATE_VARIANT[normalized] ?? 'neutral';
  const icon = STATE_ICON[normalized] ?? '?';
  return (
    <span aria-label={`Estado operacional: ${state}`}>
      <Badge variant={variant}>
        <span aria-hidden="true">{icon}</span>&nbsp;{state}
      </Badge>
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const variant: BadgeProps['variant'] =
    severity === 'CRITICAL' ? 'danger' : severity === 'WARNING' ? 'warning' : 'info';
  return (
    <span aria-label={`Severidade: ${severity}`}>
      <Badge variant={variant}>{severity}</Badge>
    </span>
  );
}

export function ReasonBadge({ code }: { code: string }) {
  return (
    <span title={code} aria-label={`Motivo: ${reasonCodeCopy(code)}`}>
      {reasonCodeCopy(code)}
    </span>
  );
}
