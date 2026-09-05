import { syncStockToShopify } from '../services/shopify-sync.js';
import { logger } from '../logger.js';

export async function runShopifySyncJob(): Promise<void> {
  if (!process.env['SHOPIFY_SHOP_DOMAIN']) {
    logger.debug('Shopify sync skipped: SHOPIFY_SHOP_DOMAIN not configured');
    return;
  }

  const start = Date.now();
  try {
    const result = await syncStockToShopify();
    const duration = Date.now() - start;
    logger.info({ ...result, durationMs: duration }, 'Shopify sync completed');
  } catch (err) {
    logger.error({ err }, 'Shopify sync job failed');
    throw err; // pg-boss will retry
  }
}
