import { db } from '../db/index.js';
import { skus, batches, locations, gtins } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

export interface SkuLabelData {
  skuCode: string;
  skuName: string;
  primaryBarcode?: string;
  mrp?: string | null;
  gstRate: string;
  uom: string;
}

export interface BatchLabelData extends SkuLabelData {
  batchNumber: string;
  mfgDate?: Date | null;
  expiryDate?: Date | null;
}

export interface LocationLabelData {
  locationCode: string;
  locationType: string;
  aisle?: string | null;
  rack?: string | null;
  shelf?: string | null;
  position?: string | null;
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Generates a ZPL label for a SKU (without batch info).
 * Uses ZPL II format for Zebra ZD-series printers at 203 DPI.
 */
export function generateSkuZpl(data: SkuLabelData): string {
  const barcode = data.primaryBarcode ?? data.skuCode;

  return [
    '^XA',
    '^MMT',
    '^PW400',
    '^LL200',
    '^LS0',
    // Header: SKU name
    `^FO10,10^A0N,24,24^FD${sanitizeZpl(data.skuName)}^FS`,
    // SKU code
    `^FO10,40^A0N,18,18^FDSKU: ${sanitizeZpl(data.skuCode)}^FS`,
    // MRP
    data.mrp ? `^FO10,65^A0N,18,18^FDMRP: Rs.${sanitizeZpl(data.mrp)}^FS` : '',
    // UOM / GST
    `^FO10,90^A0N,16,16^FD${sanitizeZpl(data.uom)} | GST ${sanitizeZpl(data.gstRate)}%^FS`,
    // Barcode (Code128)
    `^FO10,115^BCN,50,Y,N,N^FD${sanitizeZpl(barcode)}^FS`,
    '^XZ',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Generates a ZPL label for a batch (includes expiry date and MFG date).
 */
export function generateBatchZpl(data: BatchLabelData): string {
  const barcode = data.primaryBarcode ?? data.skuCode;

  return [
    '^XA',
    '^MMT',
    '^PW400',
    '^LL250',
    '^LS0',
    // SKU name
    `^FO10,10^A0N,24,24^FD${sanitizeZpl(data.skuName)}^FS`,
    // SKU code
    `^FO10,40^A0N,18,18^FDSKU: ${sanitizeZpl(data.skuCode)}^FS`,
    // Batch number
    `^FO10,65^A0N,18,18^FDBatch: ${sanitizeZpl(data.batchNumber)}^FS`,
    // MFG / Expiry dates
    data.mfgDate
      ? `^FO10,90^A0N,16,16^FDMFG: ${formatDate(data.mfgDate)}^FS`
      : '',
    data.expiryDate
      ? `^FO200,90^A0N,16,16^FDEXP: ${formatDate(data.expiryDate)}^FS`
      : '',
    // MRP
    data.mrp ? `^FO10,115^A0N,18,18^FDMRP: Rs.${sanitizeZpl(data.mrp)}^FS` : '',
    // Barcode
    `^FO10,140^BCN,60,Y,N,N^FD${sanitizeZpl(barcode)}^FS`,
    '^XZ',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Generates a ZPL location label for bin/shelf labelling.
 */
export function generateLocationZpl(data: LocationLabelData): string {
  const addressParts = [data.aisle, data.rack, data.shelf, data.position].filter(Boolean);
  const address = addressParts.join('-');

  return [
    '^XA',
    '^MMT',
    '^PW300',
    '^LL150',
    '^LS0',
    `^FO10,10^A0N,28,28^FD${sanitizeZpl(data.locationCode)}^FS`,
    address ? `^FO10,45^A0N,20,20^FD${sanitizeZpl(address)}^FS` : '',
    `^FO10,70^A0N,16,16^FD${sanitizeZpl(data.locationType.toUpperCase())}^FS`,
    // Large barcode for location code
    `^FO10,95^BCN,45,Y,N,N^FD${sanitizeZpl(data.locationCode)}^FS`,
    '^XZ',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Loads SKU + primary barcode from DB and returns ZPL.
 */
export async function generateSkuLabelFromId(skuId: string): Promise<string> {
  const sku = await db.query.skus.findFirst({
    where: eq(skus.id, skuId),
  });

  if (!sku) throw new Error(`SKU ${skuId} not found`);

  const primaryGtin = await db.query.gtins.findFirst({
    where: eq(gtins.sku_id, skuId),
  });

  return generateSkuZpl({
    skuCode: sku.code,
    skuName: sku.name,
    primaryBarcode: primaryGtin?.barcode,
    mrp: sku.mrp,
    gstRate: sku.gst_rate,
    uom: sku.uom,
  });
}

/**
 * Loads batch data from DB and returns ZPL.
 */
export async function generateBatchLabelFromId(batchId: string): Promise<string> {
  const batch = await db.query.batches.findFirst({
    where: eq(batches.id, batchId),
  });
  if (!batch) throw new Error(`Batch ${batchId} not found`);

  const sku = await db.query.skus.findFirst({
    where: eq(skus.id, batch.sku_id),
  });
  if (!sku) throw new Error(`SKU ${batch.sku_id} not found`);

  const primaryGtin = await db.query.gtins.findFirst({
    where: eq(gtins.sku_id, batch.sku_id),
  });

  return generateBatchZpl({
    skuCode: sku.code,
    skuName: sku.name,
    primaryBarcode: primaryGtin?.barcode,
    mrp: sku.mrp,
    gstRate: sku.gst_rate,
    uom: sku.uom,
    batchNumber: batch.batch_number,
    mfgDate: batch.mfg_date,
    expiryDate: batch.expiry_date,
  });
}

/**
 * Loads location data from DB and returns ZPL.
 */
export async function generateLocationLabelFromId(locationId: string): Promise<string> {
  const location = await db.query.locations.findFirst({
    where: eq(locations.id, locationId),
  });
  if (!location) throw new Error(`Location ${locationId} not found`);

  return generateLocationZpl({
    locationCode: location.code,
    locationType: location.type,
    aisle: location.aisle,
    rack: location.rack,
    shelf: location.shelf,
    position: location.position,
  });
}

/**
 * Strips ZPL control characters and carets from user-supplied strings
 * to prevent ZPL injection.
 */
function sanitizeZpl(value: string): string {
  return value.replace(/[\^~]/g, '').slice(0, 40);
}
