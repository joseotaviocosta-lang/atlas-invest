import { runRestoreVerificationDrill } from '../src/backup';

async function main() {
  console.info('--- PROJECT ATLAS: DATABASE RESTORE & INVARIANT DRILL ---');
  try {
    const result = await runRestoreVerificationDrill();
    console.info(`\nRestore Verification Drill Completed in ${result.rtoMs}ms (RTO):`);
    console.info(`- Backup file verified: ${result.backupFile}`);
    console.info(`- SHA-256 Checksum:     ${result.checksumValid ? 'PASS (matches)' : 'FAIL'}`);
    console.info(`- Isolated database:    ${result.tempDatabaseName}`);
    console.info(`- Drill Overall Status: ${result.success ? 'PASS' : 'FAIL'}`);
    console.info('\n--- ASSERTED FINANCIAL & SCHEMA INVARIANTS ---');
    console.info(
      `- Migrations Applied:    ${result.invariants.migrationCount} / 45 (Expected: 45)`,
    );
    console.info(`- Tables Verified:       ${result.invariants.tableCount}`);
    console.info(`- Ledger Transactions:   ${result.invariants.transactionCount}`);
    console.info(
      `- Ledger Integrity:      ${result.invariants.ledgerIntegrity ? 'PASS (all amounts/decimals valid)' : 'FAIL'}`,
    );
    console.info(`- Rectifications:        ${result.invariants.rectificationCount}`);
    console.info(`- Reconciliations:       ${result.invariants.reconciliationDecisionCount}`);
    console.info(`- Watchlists:            ${result.invariants.watchlistCount}`);
    console.info(`- Users:                 ${result.invariants.userCount}`);
    console.info(
      `- Notifications Schema:  ${result.invariants.notificationsIntact ? 'PASS' : 'FAIL'}`,
    );
    console.info(
      `- Audit Trail Schema:    ${result.invariants.auditHistoryIntact ? 'PASS' : 'FAIL'}`,
    );
    console.info(
      `- Privacy & DSR Schema:  ${result.invariants.privacyTablesIntact ? 'PASS' : 'FAIL'}`,
    );
    console.info('----------------------------------------------');

    if (!result.success) {
      console.error('CRITICAL: Restore verification drill failed to satisfy all invariants!');
      process.exit(1);
    }

    process.exit(0);
  } catch (err) {
    console.error('CRITICAL: Restore drill encountered fatal error:', err);
    process.exit(1);
  }
}

main();
