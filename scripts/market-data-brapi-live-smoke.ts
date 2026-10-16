/**
 * Project Atlas — Phase 5A-I1
 * BRAPI Live Smoke Test (Read-only, EOD Quotes)
 * Verifies PETR4, VALE3 live quote ingestion and HGLG11 missing token mapping.
 */
import { BrapiProviderAdapter } from '../packages/market-data/src/index';

async function main() {
  console.info('[BRAPI Live Smoke] Initializing BrapiProviderAdapter...');
  const adapter = new BrapiProviderAdapter();

  console.info('[BRAPI Live Smoke] Fetching quote for PETR4...');
  const petr4Res = await adapter.getQuotes([
    {
      assetId: '11111111-1111-4111-8111-111111111111',
      ticker: 'PETR4',
      exchange: 'B3',
      currency: 'BRL',
      assetType: 'STOCK',
    },
  ]);

  console.info('[BRAPI Live Smoke] PETR4 Result:', {
    quotesCount: petr4Res.quotes.length,
    unavailableCount: petr4Res.unavailable.length,
    quote: petr4Res.quotes[0]
      ? {
          ticker: petr4Res.quotes[0].providerSymbol,
          price: petr4Res.quotes[0].price.amount,
          currency: petr4Res.quotes[0].currency,
          asOf: petr4Res.quotes[0].asOf,
          source: petr4Res.quotes[0].source,
          status: petr4Res.quotes[0].status,
        }
      : null,
  });

  console.info('[BRAPI Live Smoke] Fetching quote for VALE3...');
  const vale3Res = await adapter.getQuotes([
    {
      assetId: '22222222-2222-4222-8222-222222222222',
      ticker: 'VALE3',
      exchange: 'B3',
      currency: 'BRL',
      assetType: 'STOCK',
    },
  ]);

  console.info('[BRAPI Live Smoke] VALE3 Result:', {
    quotesCount: vale3Res.quotes.length,
    unavailableCount: vale3Res.unavailable.length,
    quote: vale3Res.quotes[0]
      ? {
          ticker: vale3Res.quotes[0].providerSymbol,
          price: vale3Res.quotes[0].price.amount,
          currency: vale3Res.quotes[0].currency,
          asOf: vale3Res.quotes[0].asOf,
          source: vale3Res.quotes[0].source,
          status: vale3Res.quotes[0].status,
        }
      : null,
  });

  console.info(
    '[BRAPI Live Smoke] Fetching quote for HGLG11 (verifying authentication/missing token mapping)...',
  );
  const hglg11Res = await adapter.getQuotes([
    {
      assetId: '33333333-3333-4333-8333-333333333333',
      ticker: 'HGLG11',
      exchange: 'B3',
      currency: 'BRL',
      assetType: 'FII',
    },
  ]);

  console.info('[BRAPI Live Smoke] HGLG11 Result:', {
    quotesCount: hglg11Res.quotes.length,
    unavailableCount: hglg11Res.unavailable.length,
    unavailable: hglg11Res.unavailable[0] ?? null,
  });

  console.info('[BRAPI Live Smoke] BRAPI Live Smoke completed successfully.');
}

main().catch((err) => {
  console.error('[BRAPI Live Smoke] Error:', err);
  process.exit(1);
});
