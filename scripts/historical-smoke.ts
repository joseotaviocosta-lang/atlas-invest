/* eslint-disable no-console */
import { LocalDate } from '@atlas/domain';
import { StooqHistoricalMarketDataProvider } from '@atlas/market-data';

async function main() {
  const ticker = process.argv.find((a) => a.startsWith('--ticker='))?.split('=')[1] ?? 'PETR4';
  const dateStr = process.argv.find((a) => a.startsWith('--date='))?.split('=')[1] ?? '2026-09-15';
  const exchange = process.argv.find((a) => a.startsWith('--exchange='))?.split('=')[1] ?? 'B3';

  const provider = new StooqHistoricalMarketDataProvider({ timeoutMs: 15000 });
  const date = LocalDate.from(dateStr);
  const ref = {
    assetId: 'smoke-test-id',
    ticker,
    exchange,
    currency: 'BRL' as never,
    assetType: 'STOCK' as never,
  };

  console.log(`[Smoke] Fetching ${ticker} (${exchange}) for ${dateStr} via Stooq...`);
  try {
    const price = await provider.getDailyPrice(ref as never, date);
    console.log('[Smoke] Result:');
    console.log(`  requestedDate: ${dateStr}`);
    console.log(`  priceDate: ${price.date.toString()}`);
    console.log(`  symbol: ${ticker}.${exchange}`);
    console.log(`  price: ${price.close.amount} ${price.close.currency}`);
    console.log(`  currency: ${price.currency}`);
    console.log(`  source: ${price.source}`);
    console.log(`  status: ${price.status}`);
    console.log(`  resolution: ${price.status === 'EXACT' ? 'EXACT' : 'PREVIOUS_TRADING_DAY'}`);
    console.log('[Smoke] PASS - Historical price fetched from real provider');
  } catch (err) {
    console.error('[Smoke] FAIL:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
