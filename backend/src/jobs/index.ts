import PgBoss from 'pg-boss';
import { logger } from '../logger.js';
import { runShopifySyncJob } from './shopify-sync.js';
import { runExpiryAlertsJob } from './expiry-alerts.js';
import { runReorderCalcJob } from './reorder-calc.js';
import { cleanupExpiredIdempotencyKeys } from '../middleware/idempotency.js';

export const JOB_NAMES = {
  SHOPIFY_SYNC: 'shopify-sync',
  EXPIRY_ALERTS: 'expiry-alerts',
  REORDER_CALC: 'reorder-calc',
  IDEMPOTENCY_CLEANUP: 'idempotency-cleanup',
} as const;

let boss: PgBoss | null = null;

export async function startJobQueue(): Promise<PgBoss> {
  const databaseUrl =
    process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/fabb6_mis';

  boss = new PgBoss({
    connectionString: databaseUrl,
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    deleteAfterDays: 7,
    monitorStateIntervalSeconds: 60,
  });

  boss.on('error', (err: Error) => {
    logger.error({ err }, 'pg-boss error');
  });

  await boss.start();
  logger.info('pg-boss job queue started');

  // Register handlers
  await boss.work(JOB_NAMES.SHOPIFY_SYNC, { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    logger.info({ jobId: job.id }, 'Running shopify-sync job');
    await runShopifySyncJob();
  });

  await boss.work(JOB_NAMES.EXPIRY_ALERTS, { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    logger.info({ jobId: job.id }, 'Running expiry-alerts job');
    await runExpiryAlertsJob();
  });

  await boss.work(JOB_NAMES.REORDER_CALC, { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    logger.info({ jobId: job.id }, 'Running reorder-calc job');
    await runReorderCalcJob();
  });

  await boss.work(
    JOB_NAMES.IDEMPOTENCY_CLEANUP,
    { teamSize: 1, teamConcurrency: 1 },
    async (job) => {
      logger.info({ jobId: job.id }, 'Running idempotency-cleanup job');
      await cleanupExpiredIdempotencyKeys();
    },
  );

  // Schedule recurring jobs
  await boss.schedule(JOB_NAMES.SHOPIFY_SYNC, '*/30 * * * *', {}, { singletonKey: 'shopify-sync' });
  await boss.schedule(JOB_NAMES.EXPIRY_ALERTS, '0 7 * * *', {}, { singletonKey: 'expiry-alerts' });
  await boss.schedule(JOB_NAMES.REORDER_CALC, '0 6 * * *', {}, { singletonKey: 'reorder-calc' });
  await boss.schedule(
    JOB_NAMES.IDEMPOTENCY_CLEANUP,
    '0 2 * * *',
    {},
    { singletonKey: 'idempotency-cleanup' },
  );

  logger.info('All job schedules registered');
  return boss;
}

export async function stopJobQueue(): Promise<void> {
  if (boss) {
    await boss.stop({ timeout: 10_000 });
    logger.info('pg-boss job queue stopped');
    boss = null;
  }
}

export async function enqueueJob(
  name: string,
  data: Record<string, unknown> = {},
  options?: PgBoss.SendOptions,
): Promise<string | null> {
  if (!boss) throw new Error('Job queue not initialized');
  return boss.send(name, data, options ?? {});
}

export function getJobQueue(): PgBoss {
  if (!boss) throw new Error('Job queue not initialized');
  return boss;
}
