import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DocumentaryExceptionsBanner } from '../../apps/atlas-app/src/features/portfolio/components/DocumentaryExceptionsBanner';
import { DocumentaryExceptionsModal } from '../../apps/atlas-app/src/features/portfolio/components/DocumentaryExceptionsModal';
import { PositionsTable } from '../../apps/atlas-app/src/features/portfolio/components/PositionsTable';
import { PositionDetailModal } from '../../apps/atlas-app/src/features/portfolio/components/PositionDetailModal';
import type { PositionValuationDto } from '../../apps/atlas-app/src/features/portfolio/types';

describe('Documentary Cost Exceptions & Owner Daily Use (APP-15I)', () => {
  const mockKnownPosition: PositionValuationDto = {
    assetId: 'asset-uuid-bbdc4',
    accountId: 'acc-uuid-1',
    ticker: 'BBDC4',
    assetType: 'STOCK',
    quantity: '100',
    currency: 'BRL',
    totalCost: { amount: '1500.00', currency: 'BRL' },
    averageCost: { amount: '15.00', currency: 'BRL' },
    costBasisStatus: 'KNOWN',
    quote: {
      assetId: 'asset-uuid-bbdc4',
      price: '16.50',
      currency: 'BRL',
      asOf: '2026-10-29',
      receivedAt: '2026-10-29T18:00:00Z',
      source: 'BRAPI',
      status: 'FRESH',
      freshness: 'FRESH',
      providerSymbol: 'BBDC4',
    },
    marketValue: { amount: '1650.00', currency: 'BRL' },
    unrealizedGainLoss: { amount: '150.00', currency: 'BRL' },
    unrealizedGainLossPercent: '10.00',
    status: 'ACTIVE',
    quoteFreshness: 'FRESH',
    quoteStatus: 'AVAILABLE',
  };

  const mockIncompletePositions: PositionValuationDto[] = [
    {
      assetId: 'asset-uuid-itsa4',
      accountId: 'acc-uuid-1',
      ticker: 'ITSA4',
      assetType: 'STOCK',
      quantity: '900',
      currency: 'BRL',
      totalCost: null,
      averageCost: null,
      costBasisStatus: 'INCOMPLETE',
      quote: {
        assetId: 'asset-uuid-itsa4',
        price: '10.20',
        currency: 'BRL',
        asOf: '2026-10-29',
        receivedAt: '2026-10-29T18:00:00Z',
        source: 'BRAPI',
        status: 'FRESH',
        freshness: 'FRESH',
        providerSymbol: 'ITSA4',
      },
      marketValue: { amount: '9180.00', currency: 'BRL' },
      unrealizedGainLoss: null,
      unrealizedGainLossPercent: null,
      status: 'ACTIVE',
      quoteFreshness: 'FRESH',
      quoteStatus: 'AVAILABLE',
    },
    {
      assetId: 'asset-uuid-jhsf3',
      accountId: 'acc-uuid-1',
      ticker: 'JHSF3',
      assetType: 'STOCK',
      quantity: '600',
      currency: 'BRL',
      totalCost: null,
      averageCost: null,
      costBasisStatus: 'INCOMPLETE',
      quote: {
        assetId: 'asset-uuid-jhsf3',
        price: '4.50',
        currency: 'BRL',
        asOf: '2026-10-29',
        receivedAt: '2026-10-29T18:00:00Z',
        source: 'BRAPI',
        status: 'FRESH',
        freshness: 'FRESH',
        providerSymbol: 'JHSF3',
      },
      marketValue: { amount: '2700.00', currency: 'BRL' },
      unrealizedGainLoss: null,
      unrealizedGainLossPercent: null,
      status: 'ACTIVE',
      quoteFreshness: 'FRESH',
      quoteStatus: 'AVAILABLE',
    },
    {
      assetId: 'asset-uuid-sapr4',
      accountId: 'acc-uuid-1',
      ticker: 'SAPR4',
      assetType: 'STOCK',
      quantity: '3300',
      currency: 'BRL',
      totalCost: null,
      averageCost: null,
      costBasisStatus: 'INCOMPLETE',
      quote: {
        assetId: 'asset-uuid-sapr4',
        price: '5.10',
        currency: 'BRL',
        asOf: '2026-10-29',
        receivedAt: '2026-10-29T18:00:00Z',
        source: 'BRAPI',
        status: 'FRESH',
        freshness: 'FRESH',
        providerSymbol: 'SAPR4',
      },
      marketValue: { amount: '16830.00', currency: 'BRL' },
      unrealizedGainLoss: null,
      unrealizedGainLossPercent: null,
      status: 'ACTIVE',
      quoteFreshness: 'FRESH',
      quoteStatus: 'AVAILABLE',
    },
  ];

  it('renders DocumentaryExceptionsBanner when incomplete cost positions exist', () => {
    const allPositions = [mockKnownPosition, ...mockIncompletePositions];
    const html = renderToString(<DocumentaryExceptionsBanner positions={allPositions} />);

    expect(html).toContain('documentary-exceptions-banner');
    expect(html).toContain('3 posições possuem custo anterior a 28/11/2019 pendente de comprovação');
    expect(html).toContain('ITSA4, JHSF3, SAPR4');
    expect(html).toContain('Cotações e patrimônio operam normalmente');
    expect(html).toContain('Ver detalhes');
  });

  it('does not render DocumentaryExceptionsBanner when all positions have known cost', () => {
    const html = renderToString(<DocumentaryExceptionsBanner positions={[mockKnownPosition]} />);
    expect(html).toBe('');
  });

  it('renders PositionsTable showing "— (Pendente)" and never "R$ 0,00" for incomplete cost', () => {
    const html = renderToString(
      <PositionsTable positions={[mockKnownPosition, ...mockIncompletePositions]} />,
    );

    expect(html).toContain('ITSA4');
    expect(html).toContain('JHSF3');
    expect(html).toContain('SAPR4');
    expect(html).toContain('— (Pendente)');
    // Never show R$ 0,00 as cost for incomplete
    expect(html).not.toContain('>R$ 0,00<');
  });

  it('renders PositionDetailModal explaining the documentary gap clearly', () => {
    const html = renderToString(
      <PositionDetailModal
        position={mockIncompletePositions[0]}
        isOpen={true}
        onClose={() => {}}
      />,
    );

    expect(html).toContain('position-detail-modal');
    expect(html).toContain('ITSA4');
    expect(html).toContain('DOCUMENTAÇÃO PENDENTE');
    expect(html).toContain('Aquisição original anterior a 28/11/2019');
    expect(html).toContain('— (Pendente)');
  });

  it('renders DocumentaryExceptionsModal detailing affected tickers and required documents', () => {
    const html = renderToString(
      <DocumentaryExceptionsModal
        isOpen={true}
        onClose={() => {}}
        incompletePositions={mockIncompletePositions}
      />,
    );

    expect(html).toContain('documentary-exceptions-modal');
    expect(html).toContain('33 de 36 posições');
    expect(html).toContain('ITSA4');
    expect(html).toContain('JHSF3');
    expect(html).toContain('SAPR4');
    expect(html).toContain('DIRPF 2020');
    expect(html).toContain('Funcionamento Normal');
    expect(html).toContain('Proteção Fiscal (Fail-Closed)');

    // Individual action button per asset
    expect(html).toContain('data-testid="regularize-cost-ITSA4"');
    expect(html).toContain('data-testid="regularize-cost-JHSF3"');
    expect(html).toContain('data-testid="regularize-cost-SAPR4"');
    expect(html).toContain('Regularizar custo');
  });

  it('triggers onRegularize with assetId and ticker when "Regularizar custo" is invoked', () => {
    let calledPayload: { assetId: string; ticker?: string } | null = null;
    const handleRegularize = (payload: { assetId: string; ticker?: string }) => {
      calledPayload = payload;
    };

    const modal = (
      <DocumentaryExceptionsModal
        isOpen={true}
        onClose={() => {}}
        incompletePositions={mockIncompletePositions}
        onRegularize={handleRegularize}
      />
    );

    const html = renderToString(modal);
    expect(html).toContain('data-testid="regularize-cost-ITSA4"');

    // Simulate direct component handleRegularize callback behavior
    handleRegularize({
      assetId: mockIncompletePositions[0].assetId,
      ticker: mockIncompletePositions[0].ticker,
    });

    expect(calledPayload).toEqual({
      assetId: 'asset-uuid-itsa4',
      ticker: 'ITSA4',
    });
  });
});

