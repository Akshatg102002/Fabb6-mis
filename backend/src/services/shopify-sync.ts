import { pool } from '../db/index.js';
import { logger } from '../logger.js';

const SHOPIFY_API_VERSION = '2024-01';

interface ShopifyConfig {
  shopDomain: string;
  accessToken: string;
  locationId: string;
}

function getShopifyConfig(): ShopifyConfig {
  const shopDomain = process.env['SHOPIFY_SHOP_DOMAIN'];
  const accessToken = process.env['SHOPIFY_ACCESS_TOKEN'];
  const locationId = process.env['SHOPIFY_LOCATION_ID'];

  if (!shopDomain || !accessToken || !locationId) {
    throw new Error(
      'Missing Shopify config: SHOPIFY_SHOP_DOMAIN, SHOPIFY_ACCESS_TOKEN, SHOPIFY_LOCATION_ID',
    );
  }

  return { shopDomain, accessToken, locationId };
}

interface ShopifyInventoryLevel {
  inventory_item_id: number;
  location_id: number;
  available: number;
}

interface ShopifyInventoryItem {
  id: number;
  sku: string;
  tracked: boolean;
}

/**
 * Fetches inventory levels from Shopify and compares against local stock.
 * Returns a list of SKUs where stock differs.
 */
export async function fetchShopifyInventory(): Promise<
  {
    shopifyItemId: number;
    sku: string;
    shopifyQty: number;
    localQty: number;
    skuId: string | null;
  }[]
> {
  const config = getShopifyConfig();
  const baseUrl = `https://${config.shopDomain}/admin/api/${SHOPIFY_API_VERSION}`;

  // Fetch inventory levels
  const levelsResp = await fetch(
    `${baseUrl}/inventory_levels.json?location_ids=${config.locationId}&limit=250`,
    {
      headers: {
        'X-Shopify-Access-Token': config.accessToken,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!levelsResp.ok) {
    throw new Error(`Shopify API error: ${levelsResp.status} ${levelsResp.statusText}`);
  }

  const levelsData = (await levelsResp.json()) as { inventory_levels: ShopifyInventoryLevel[] };
  const levels = levelsData.inventory_levels;

  // Fetch inventory items to get SKU codes
  const itemIds = levels.map((l) => l.inventory_item_id).slice(0, 250);
  if (itemIds.length === 0) return [];

  const itemsResp = await fetch(
    `${baseUrl}/inventory_items.json?ids=${itemIds.join(',')}&limit=250`,
    {
      headers: {
        'X-Shopify-Access-Token': config.accessToken,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!itemsResp.ok) {
    throw new Error(`Shopify API error fetching items: ${itemsResp.status}`);
  }

  const itemsData = (await itemsResp.json()) as { inventory_items: ShopifyInventoryItem[] };
  const itemMap = new Map(itemsData.inventory_items.map((i) => [i.id, i]));

  // Fetch local stock by SKU code
  const client = await pool.connect();
  try {
    const skuCodes = itemsData.inventory_items.map((i) => i.sku).filter(Boolean);

    const localStock = await client.query<{ code: string; id: string; qty: number }>(
      `SELECT s.code, s.id, COALESCE(SUM(soh.quantity), 0) as qty
       FROM skus s
       LEFT JOIN stock_on_hand soh ON soh.sku_id = s.id
       WHERE s.code = ANY($1::text[])
       GROUP BY s.id, s.code`,
      [skuCodes],
    );

    const localStockMap = new Map(localStock.rows.map((r) => [r.code, r]));

    const discrepancies = [];
    for (const level of levels) {
      const item = itemMap.get(level.inventory_item_id);
      if (!item?.sku) continue;

      const local = localStockMap.get(item.sku);
      const localQty = local ? Number(local.qty) : 0;

      discrepancies.push({
        shopifyItemId: level.inventory_item_id,
        sku: item.sku,
        shopifyQty: level.available,
        localQty,
        skuId: local?.id ?? null,
      });
    }

    return discrepancies;
  } finally {
    client.release();
  }
}

/**
 * Updates inventory level for one item in Shopify.
 */
export async function setShopifyInventoryLevel(
  inventoryItemId: number,
  available: number,
): Promise<void> {
  const config = getShopifyConfig();
  const baseUrl = `https://${config.shopDomain}/admin/api/${SHOPIFY_API_VERSION}`;

  const resp = await fetch(`${baseUrl}/inventory_levels/set.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': config.accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      location_id: config.locationId,
      inventory_item_id: inventoryItemId,
      available,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Shopify setInventoryLevel failed: ${resp.status} ${body}`);
  }

  logger.info({ inventoryItemId, available }, 'Shopify inventory level updated');
}

/**
 * Syncs local stock to Shopify for all tracked SKUs.
 * Pushes only when there is a discrepancy.
 */
export async function syncStockToShopify(): Promise<{
  synced: number;
  skipped: number;
  errors: number;
}> {
  const discrepancies = await fetchShopifyInventory();
  let synced = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of discrepancies) {
    if (item.shopifyQty === item.localQty) {
      skipped++;
      continue;
    }

    try {
      await setShopifyInventoryLevel(item.shopifyItemId, item.localQty);
      synced++;
    } catch (err) {
      logger.error({ err, sku: item.sku }, 'Failed to sync SKU to Shopify');
      errors++;
    }
  }

  return { synced, skipped, errors };
}
