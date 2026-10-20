/**
 * Phase 5E (R3-A) - Ingestion module wiring.
 *
 * R3-A exposes the job core only. R3-B adds the ten handlers and the local
 * scheduler; R3-C adds the privileged admin surface.
 */
import { Module } from '@nestjs/common';
import { getPrismaClient } from '@atlas/database';
import { PrismaJobRepository } from './job-repository';
import { PrismaJobLock } from './job-lock';
import { JobRunner } from './job-runner';
import { INGESTION_JOB_LOCK, INGESTION_JOB_REPOSITORY } from './tokens';

@Module({
  providers: [
    {
      provide: INGESTION_JOB_REPOSITORY,
      useFactory: () => new PrismaJobRepository(getPrismaClient()),
    },
    {
      provide: INGESTION_JOB_LOCK,
      useFactory: () => new PrismaJobLock(getPrismaClient()),
    },
    JobRunner,
  ],
  exports: [INGESTION_JOB_REPOSITORY, INGESTION_JOB_LOCK, JobRunner],
})
export class IngestionModule {}
