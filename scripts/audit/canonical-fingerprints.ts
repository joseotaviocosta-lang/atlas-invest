/**
 * Canonical owner/test database fingerprint audit (Phase 5D-H1.1).
 *
 * Read-only behavior: issues exclusively SELECT statements, never mutates
 * data, never runs migrations. Prints the connected database identity
 * (host/port/name, verified server-side) followed by the five canonical
 * content fingerprints.
 *
 * Canonical recipes (field order + row order are part of the recipe):
 *   ledger:    transactions WHERE portfolio_id != <validation portfolio>,
 *              fields (id, portfolio_id, type, quantity, unit_price, trade_date),
 *              order by id
 *   benchmark: benchmark_observations,
 *              fields (benchmark_id, reference_date, source, value),
 *              order by benchmark_id, reference_date, source
 *   fx:        fx_observations,
 *              fields (base_currency, quote_currency, observation_date, source, rate_type, rate),
 *              order by base_currency, quote_currency, observation_date, source, rate_type
 *   calendar:  calendar_days,
 *              fields (calendar_type, date, is_open, reason, source),
 *              order by calendar_type, date
 *   macro:     macro_observations,
 *              fields (series_id, reference_date, source, frequency, unit, value),
 *              order by series_id, reference_date, source
 *
 * Normalization (lossless, locale-independent):
 *   - fields joined with '|' (NULL rendered as ''), rows concatenated with '',
 *   - numerics via ::text (full stored scale, never float),
 *   - dates via ::text (civil YYYY-MM-DD), booleans via ::text (true/false),
 *   - md5 over the UTF-8 bytes, lowercase hex.
 *
 * Usage:
 *   tsx --tsconfig tsconfig.smoke.json scripts/audit/canonical-fingerprints.ts --mode owner-audit
 *   tsx --tsconfig tsconfig.smoke.json scripts/audit/canonical-fingerprints.ts --mode read-only --database-url <url>
 *
 * In --mode owner-audit the script aborts unless the target is exactly the
 * owner database (host localhost/127.0.0.1, port 5434, database atlas_dev).
 */
import { PrismaClient } from '@prisma/client';

const OWNER_PORT = '5434';
const OWNER_DB = 'atlas_dev';
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const VALIDATION_PORTFOLIO_ID = 'd0000000-0000-4000-8000-000000000001';

const QUERIES: Record<string, string> = {
  ledger: `SELECT md5(string_agg(concat_ws('|',
      coalesce(id::text, ''),
      coalesce(portfolio_id::text, ''),
      coalesce(type, ''),
      coalesce(quantity::text, ''),
      coalesce(unit_price::text, ''),
      coalesce(trade_date::text, '')
    ), '' ORDER BY id)) AS fp
    FROM transactions WHERE portfolio_id != '${VALIDATION_PORTFOLIO_ID}'`,
  benchmark: `SELECT md5(string_agg(concat_ws('|',
      coalesce(benchmark_id, ''),
      coalesce(reference_date::text, ''),
      coalesce(source, ''),
      coalesce(value::text, '')
    ), '' ORDER BY benchmark_id, reference_date, source)) AS fp
    FROM benchmark_observations`,
  fx: `SELECT md5(string_agg(concat_ws('|',
      coalesce(base_currency, ''),
      coalesce(quote_currency, ''),
      coalesce(observation_date::text, ''),
      coalesce(source, ''),
      coalesce(rate_type, ''),
      coalesce(rate::text, '')
    ), '' ORDER BY base_currency, quote_currency, observation_date, source, rate_type)) AS fp
    FROM fx_observations`,
  calendar: `SELECT md5(string_agg(concat_ws('|',
      coalesce(calendar_type, ''),
      coalesce(date::text, ''),
      coalesce(is_open::text, ''),
      coalesce(reason, ''),
      coalesce(source, '')
    ), '' ORDER BY calendar_type, date)) AS fp
    FROM calendar_days`,
  macro: `SELECT md5(string_agg(concat_ws('|',
      coalesce(series_id, ''),
      coalesce(reference_date::text, ''),
      coalesce(source, ''),
      coalesce(frequency, ''),
      coalesce(unit, ''),
      coalesce(value::text, '')
    ), '' ORDER BY series_id, reference_date, source)) AS fp
    FROM macro_observations`,
};

function parseArgs(): { mode: string; databaseUrl?: string } {
  const args = process.argv.slice(2);
  let mode = 'read-only';
  let databaseUrl: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && args[i + 1]) {
      mode = args[++i];
    } else if (args[i] === '--database-url' && args[i + 1]) {
      databaseUrl = args[++i];
    }
  }
  return { mode, databaseUrl };
}

function describeUrl(url: string): { host: string; port: string; database: string } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port,
    database: parsed.pathname.replace(/^\//, ''),
  };
}

async function main(): Promise<void> {
  const { mode, databaseUrl } = parseArgs();
  const url = databaseUrl ?? process.env.DATABASE_URL ?? process.env.DATABASE_TEST_URL ?? '';
  if (!url) {
    console.error('canonical-fingerprints: no database URL provided (use --database-url).');
    process.exit(1);
  }

  const claimed = describeUrl(url);
  if (mode === 'owner-audit') {
    if (
      !ALLOWED_HOSTS.has(claimed.host) ||
      claimed.port !== OWNER_PORT ||
      claimed.database !== OWNER_DB
    ) {
      console.error(
        `canonical-fingerprints: owner-audit mode refuses target ` +
          `(host='${claimed.host}' port='${claimed.port}' database='${claimed.database}'). ` +
          `Expected host in [localhost, 127.0.0.1, ::1], port '${OWNER_PORT}', database '${OWNER_DB}'.`,
      );
      process.exit(1);
    }
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const identity = await prisma.$queryRawUnsafe<Array<{ db: string; port: number }>>(
      'SELECT current_database() AS db, inet_server_port() AS port',
    );
    console.info(
      `database: host='${claimed.host}' port='${claimed.port}' name='${identity[0].db}' ` +
        `(server reports db='${identity[0].db}' port='${identity[0].port}')`,
    );
    if (mode === 'owner-audit' && identity[0].db !== OWNER_DB) {
      console.error(
        `canonical-fingerprints: server-side database is '${identity[0].db}', ` +
          `expected '${OWNER_DB}'. Aborting.`,
      );
      process.exit(1);
    }

    for (const [name, sql] of Object.entries(QUERIES)) {
      const rows = await prisma.$queryRawUnsafe<Array<{ fp: string }>>(sql);
      console.info(`${name}: ${rows[0].fp}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`canonical-fingerprints: failed: ${(error as Error).message}`);
  process.exit(1);
});
