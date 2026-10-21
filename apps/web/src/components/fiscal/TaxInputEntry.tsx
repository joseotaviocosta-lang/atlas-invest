'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { Card, Button } from '@/components/ui';

interface FiscalEventLite {
  sourceTransactionId: string;
  eventType: string;
  economicDate: string;
  taxAssetCategory: string;
}

interface TradeRow {
  id: string;
  transactionId: string;
  classification: string;
  conflictStatus: string;
  sourceReference: string;
}
interface WithholdingRow {
  id: string;
  competence: string;
  category: string;
  amount: string | null;
  currency: string;
  status: string;
  conflictStatus: string;
}

const inputStyle: React.CSSProperties = {
  padding: `${spacing.xs}px ${spacing.sm}px`,
  borderRadius: `${borderRadius.md}px`,
  border: `1px solid ${colors.border}`,
  fontSize: '0.8125rem',
  color: colors.textPrimary,
  backgroundColor: colors.surface,
};

export function TaxInputEntry({
  competence,
  events,
  onSaved,
}: {
  competence: string;
  events: readonly FiscalEventLite[];
  onSaved: () => void;
}) {
  const authReady = useAuthReady();
  const [tradeRows, setTradeRows] = useState<TradeRow[]>([]);
  const [withholdingRows, setWithholdingRows] = useState<WithholdingRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const [withholding, setWithholding] = useState({
    economicDate: `${competence}-15`,
    category: 'BRAZILIAN_EQUITY',
    amount: '',
    currency: 'BRL',
    status: 'CONFIRMED',
    sourceReference: '',
  });
  const [fii, setFii] = useState({
    assetId: '',
    asOfDate: `${competence}-28`,
    holderCount: '',
    investorOwnershipPercent: '',
    isExchangeTraded: 'UNKNOWN',
    status: 'KNOWN',
    sourceReference: '',
  });

  useEffect(() => {
    if (!competence) return;
    setWithholding((current) => ({ ...current, economicDate: `${competence}-15` }));
    setFii((current) => ({ ...current, asOfDate: `${competence}-28` }));
  }, [competence]);

  const load = useCallback(async () => {
    if (!authReady) return;

    try {
      const [t, w] = await Promise.all([
        apiClient.get<{ data: TradeRow[] }>('/api/v1/fiscal/inputs/trade-classifications'),
        apiClient.get<{ data: WithholdingRow[] }>(
          `/api/v1/fiscal/inputs/withholdings?competence=${competence}`,
        ),
      ]);
      setTradeRows(Array.isArray(t?.data) ? t.data : []);
      setWithholdingRows(Array.isArray(w?.data) ? w.data : []);
    } catch {
      /* ignore load errors; readiness remains authoritative */
    }
  }, [authReady, competence]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveTradeClassification(event: FiscalEventLite, classification: string) {
    if (!authReady) return;

    try {
      await apiClient.post('/api/v1/fiscal/inputs/trade-classifications', {
        transactionId: event.sourceTransactionId,
        classification,
        sourceType: 'MANUAL_CONFIRMED',
        sourceReference: `manual-${event.sourceTransactionId}`,
        effectiveDate: event.economicDate,
      });
      setMessage('Classificação registrada.');
    } catch (error) {
      setMessage(
        (error as ApiError)?.statusCode === 409
          ? 'Há informações conflitantes para esta operação.'
          : 'Não foi possível registrar a classificação.',
      );
    }
    await load();
    onSaved();
  }

  async function saveWithholding() {
    if (!authReady) return;

    try {
      await apiClient.post('/api/v1/fiscal/inputs/withholdings', {
        competence,
        economicDate: withholding.economicDate,
        category: withholding.category,
        amount: withholding.status === 'UNKNOWN' ? null : withholding.amount,
        currency: withholding.currency,
        status: withholding.status,
        sourceType: 'MANUAL',
        sourceReference: withholding.sourceReference,
      });
      setMessage('Retenção registrada.');
    } catch (error) {
      setMessage(
        (error as ApiError)?.statusCode === 409
          ? 'Há informações conflitantes para esta retenção.'
          : 'Não foi possível registrar a retenção.',
      );
    }
    await load();
    onSaved();
  }

  async function saveFii() {
    if (!authReady) return;

    try {
      await apiClient.post('/api/v1/fiscal/inputs/fii-metadata', {
        assetId: fii.assetId,
        asOfDate: fii.asOfDate,
        holderCount: fii.holderCount === '' ? null : Number(fii.holderCount),
        investorOwnershipPercent:
          fii.investorOwnershipPercent === '' ? null : fii.investorOwnershipPercent,
        isExchangeTraded:
          fii.isExchangeTraded === 'UNKNOWN' ? null : fii.isExchangeTraded === 'YES',
        sourceType: 'MANUAL_CONFIRMED',
        sourceReference: fii.sourceReference,
        status: fii.status,
      });
      setMessage('Dados do FII registrados.');
    } catch (error) {
      setMessage(
        (error as ApiError)?.statusCode === 409
          ? 'Há informações conflitantes para estes dados do FII.'
          : 'Não foi possível registrar os dados do FII.',
      );
    }
    await load();
    onSaved();
  }

  async function resolve(entity: string, id: string, action: 'KEEP_EXISTING' | 'ACCEPT_NEW') {
    if (!authReady) return;

    try {
      await apiClient.post(`/api/v1/fiscal/inputs/${entity}/${id}/resolve`, { action });
      setMessage('Conflito resolvido.');
    } catch {
      setMessage('Não foi possível resolver o conflito.');
    }
    await load();
    onSaved();
  }

  const conflicts = [
    ...(tradeRows ?? [])
      .filter((r) => r?.conflictStatus === 'CONFLICT')
      .map((r) => ({
        entity: 'trade-classification',
        id: r.id,
        label: `Classificação · ${r.transactionId?.slice(0, 8) ?? ''}`,
      })),
    ...(withholdingRows ?? [])
      .filter((r) => r?.conflictStatus === 'CONFLICT')
      .map((r) => ({ entity: 'withholding', id: r.id, label: `Retenção · ${r.category}` })),
  ];

  return (
    <div style={{ marginTop: `${spacing.xl}px` }}>
      <h2
        style={{
          fontSize: '1.1rem',
          fontWeight: 700,
          color: colors.textPrimary,
          marginBottom: `${spacing.sm}px`,
        }}
      >
        Informar dados fiscais
      </h2>

      {message && (
        <div
          style={{
            fontSize: '0.8125rem',
            color: colors.textSecondary,
            marginBottom: `${spacing.sm}px`,
          }}
          role="status"
        >
          {message}
        </div>
      )}

      <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.sm}px` }}>
        <strong style={{ color: colors.textPrimary }}>Classificação da operação</strong>
        {events.filter((e) => e.eventType === 'SALE' || e.eventType === 'PURCHASE').length ===
          0 && (
          <div style={{ fontSize: '0.8125rem', color: colors.textMuted, marginTop: '4px' }}>
            Nenhuma operação nesta competência.
          </div>
        )}
        {events
          .filter((e) => e.eventType === 'SALE' || e.eventType === 'PURCHASE')
          .slice(0, 25)
          .map((event) => (
            <div
              key={event.sourceTransactionId}
              style={{
                display: 'flex',
                gap: `${spacing.sm}px`,
                alignItems: 'center',
                padding: '4px 0',
              }}
            >
              <span style={{ fontSize: '0.8125rem', color: colors.textSecondary, flex: 1 }}>
                {event.eventType} · {event.economicDate} · {event.sourceTransactionId.slice(0, 8)}
              </span>
              {(['NORMAL', 'DAY_TRADE', 'UNKNOWN'] as const).map((value) => (
                <Button
                  key={value}
                  variant="secondary"
                  onClick={() => saveTradeClassification(event, value)}
                >
                  {value === 'NORMAL'
                    ? 'Normal'
                    : value === 'DAY_TRADE'
                      ? 'Day trade'
                      : 'Não informado'}
                </Button>
              ))}
            </div>
          ))}
      </Card>

      <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.sm}px` }}>
        <strong style={{ color: colors.textPrimary }}>Retenção/IRRF</strong>
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: `${spacing.sm}px`, marginTop: '6px' }}
        >
          <input
            style={inputStyle}
            placeholder="Data (AAAA-MM-DD)"
            value={withholding.economicDate}
            onChange={(e) => setWithholding({ ...withholding, economicDate: e.target.value })}
          />
          <select
            style={inputStyle}
            value={withholding.category}
            onChange={(e) => setWithholding({ ...withholding, category: e.target.value })}
          >
            {['BRAZILIAN_EQUITY', 'FII', 'ETF', 'BDR', 'FIXED_INCOME', 'UNKNOWN'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            style={inputStyle}
            placeholder="Valor exato (ex.: 12.34)"
            value={withholding.amount}
            onChange={(e) => setWithholding({ ...withholding, amount: e.target.value })}
          />
          <input
            style={inputStyle}
            placeholder="Moeda"
            value={withholding.currency}
            onChange={(e) =>
              setWithholding({ ...withholding, currency: e.target.value.toUpperCase() })
            }
          />
          <select
            style={inputStyle}
            value={withholding.status}
            onChange={(e) => setWithholding({ ...withholding, status: e.target.value })}
          >
            {['CONFIRMED', 'UNVERIFIED', 'UNKNOWN'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            style={inputStyle}
            placeholder="Referência"
            value={withholding.sourceReference}
            onChange={(e) => setWithholding({ ...withholding, sourceReference: e.target.value })}
          />
          <Button variant="primary" onClick={saveWithholding}>
            Registrar
          </Button>
        </div>
      </Card>

      <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.sm}px` }}>
        <strong style={{ color: colors.textPrimary }}>Dados fiscais de FII</strong>
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: `${spacing.sm}px`, marginTop: '6px' }}
        >
          <input
            style={{ ...inputStyle, minWidth: '260px' }}
            placeholder="AssetId (UUID)"
            value={fii.assetId}
            onChange={(e) => setFii({ ...fii, assetId: e.target.value })}
          />
          <input
            style={inputStyle}
            placeholder="Data-base (AAAA-MM-DD)"
            value={fii.asOfDate}
            onChange={(e) => setFii({ ...fii, asOfDate: e.target.value })}
          />
          <input
            style={inputStyle}
            placeholder="Nº de cotistas"
            value={fii.holderCount}
            onChange={(e) => setFii({ ...fii, holderCount: e.target.value })}
          />
          <input
            style={inputStyle}
            placeholder="Participação % (ex.: 2.5)"
            value={fii.investorOwnershipPercent}
            onChange={(e) => setFii({ ...fii, investorOwnershipPercent: e.target.value })}
          />
          <select
            style={inputStyle}
            value={fii.isExchangeTraded}
            onChange={(e) => setFii({ ...fii, isExchangeTraded: e.target.value })}
          >
            <option value="UNKNOWN">Negociado em bolsa: não informado</option>
            <option value="YES">Sim</option>
            <option value="NO">Não</option>
          </select>
          <input
            style={inputStyle}
            placeholder="Referência"
            value={fii.sourceReference}
            onChange={(e) => setFii({ ...fii, sourceReference: e.target.value })}
          />
          <Button variant="primary" onClick={saveFii}>
            Registrar
          </Button>
        </div>
      </Card>

      {conflicts.length > 0 && (
        <Card style={{ padding: `${spacing.base}px`, border: `1px solid ${colors.warning}` }}>
          <strong style={{ color: colors.warning }}>Há informações conflitantes</strong>
          {conflicts.map((c) => (
            <div
              key={`${c.entity}-${c.id}`}
              style={{
                display: 'flex',
                gap: `${spacing.sm}px`,
                alignItems: 'center',
                padding: '4px 0',
              }}
            >
              <span style={{ fontSize: '0.8125rem', color: colors.textSecondary, flex: 1 }}>
                {c.label}
              </span>
              <Button variant="secondary" onClick={() => resolve(c.entity, c.id, 'KEEP_EXISTING')}>
                Manter atual
              </Button>
              <Button variant="secondary" onClick={() => resolve(c.entity, c.id, 'ACCEPT_NEW')}>
                Aceitar novo
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
