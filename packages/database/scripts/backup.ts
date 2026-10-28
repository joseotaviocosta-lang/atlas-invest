import { createDatabaseBackup } from '../src/backup';

async function main() {
  console.info('--- PROJECT ATLAS: DATABASE BACKUP DRILL ---');
  try {
    const result = await createDatabaseBackup();
    console.info(`Backup completed successfully in ${result.durationMs}ms:`);
    console.info(`- File:     ${result.filePath}`);
    console.info(`- Size:     ${(result.sizeBytes / 1024).toFixed(2)} KB`);
    console.info(`- SHA256:   ${result.checksum}`);
    console.info(`- Checksum: ${result.checksumPath}`);
    process.exit(0);
  } catch (err) {
    console.error('Backup failed:', err);
    process.exit(1);
  }
}

main();
