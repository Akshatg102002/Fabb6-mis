import { pool } from '../db/index.js';
import { getExpiringBatches } from '../services/fefo.js';
import { logger } from '../index.js';

const WARNING_DAYS = parseInt(process.env['EXPIRY_WARNING_DAYS'] ?? '30', 10);

export async function runExpiryAlertsJob(): Promise<void> {
  const client = await pool.connect();

  try {
    // Get all active sites
    const sitesResult = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM sites WHERE is_active = TRUE`,
    );

    let totalAlerts = 0;

    for (const site of sitesResult.rows) {
      const expiring = await getExpiringBatches({
        siteId: site.id,
        warningDays: WARNING_DAYS,
      });

      if (expiring.length === 0) continue;

      totalAlerts += expiring.length;

      // Log each expiring batch as a structured alert
      for (const item of expiring) {
        const daysLeft = Math.ceil(
          (item.expiryDate.getTime() - Date.now()) / 86_400_000,
        );

        logger.warn(
          {
            alert: 'expiry_warning',
            siteId: site.id,
            siteName: site.name,
            skuId: item.skuId,
            skuCode: item.skuCode,
            skuName: item.skuName,
            batchId: item.batchId,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate.toISOString(),
            daysUntilExpiry: daysLeft,
            totalQty: item.totalQty,
          },
          `Expiry alert: ${item.skuName} (batch ${item.batchNumber}) expires in ${daysLeft} days`,
        );
      }
    }

    logger.info(
      { totalAlerts, warningDays: WARNING_DAYS },
      'Expiry alerts job completed',
    );
  } finally {
    client.release();
  }
}
