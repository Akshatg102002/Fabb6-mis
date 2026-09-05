import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { locations } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idempotency } from '../middleware/idempotency.js';
import { writeStockMovement } from '../services/stock-movement.js';

const router = Router();

const putawaySchema = z.object({
  sku_id: z.string().uuid(),
  batch_id: z.string().uuid().optional(),
  from_location_id: z.string().uuid(),
  to_location_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  reference_id: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
});

const bulkPutawaySchema = z.object({
  items: z
    .array(
      z.object({
        idempotency_suffix: z.string().min(1).max(50),
        sku_id: z.string().uuid(),
        batch_id: z.string().uuid().optional(),
        from_location_id: z.string().uuid(),
        to_location_id: z.string().uuid(),
        quantity: z.number().int().positive(),
        reference_id: z.string().uuid().optional(),
      }),
    )
    .min(1)
    .max(50),
});

// POST /putaway
// Move accepted GRN stock from a receiving area to a bin location
router.post(
  '/',
  requireAuth,
  requireRoles('admin', 'supervisor', 'inward'),
  idempotency,
  validate({ body: putawaySchema }),
  async (req, res) => {
    const body = req.body as z.infer<typeof putawaySchema>;
    const auth = req.auth!;

    // Validate destination is a bin or pick_face
    const destLoc = await db.query.locations.findFirst({
      where: eq(locations.id, body.to_location_id),
    });

    if (!destLoc) {
      res.status(404).json({ error: 'Destination location not found' });
      return;
    }

    if (!['bin', 'pick_face'].includes(destLoc.type)) {
      res.status(400).json({
        error: 'Invalid destination type',
        message: `Putaway destination must be bin or pick_face, got ${destLoc.type}`,
      });
      return;
    }

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined
      ?? `putaway-${auth.userId}-${body.sku_id}-${body.to_location_id}-${Date.now()}`;

    const result = await writeStockMovement({
      idempotencyKey,
      skuId: body.sku_id,
      batchId: body.batch_id ?? null,
      fromLocationId: body.from_location_id,
      toLocationId: body.to_location_id,
      quantity: body.quantity,
      movementType: 'putaway',
      referenceType: body.reference_id ? 'grn' : null,
      referenceId: body.reference_id ?? null,
      userId: auth.userId,
      deviceId: auth.deviceId,
      notes: body.notes ?? null,
    });

    res.status(201).json({
      movement_id: String(result.movementId),
      from_location_id: result.fromLocationId,
      to_location_id: result.toLocationId,
      quantity: result.quantity,
    });
  },
);

// POST /putaway/bulk — multiple putaway moves in sequence
router.post(
  '/bulk',
  requireAuth,
  requireRoles('admin', 'supervisor', 'inward'),
  validate({ body: bulkPutawaySchema }),
  async (req, res) => {
    const body = req.body as z.infer<typeof bulkPutawaySchema>;
    const auth = req.auth!;

    const succeeded = [];
    const failed = [];

    for (const item of body.items) {
      try {
        const result = await writeStockMovement({
          idempotencyKey: `putaway-bulk-${auth.userId}-${item.idempotency_suffix}`,
          skuId: item.sku_id,
          batchId: item.batch_id ?? null,
          fromLocationId: item.from_location_id,
          toLocationId: item.to_location_id,
          quantity: item.quantity,
          movementType: 'putaway',
          referenceType: item.reference_id ? 'grn' : null,
          referenceId: item.reference_id ?? null,
          userId: auth.userId,
          deviceId: auth.deviceId,
        });
        succeeded.push({ ...item, movement_id: String(result.movementId) });
      } catch (err) {
        failed.push({
          ...item,
          error: (err as Error).message,
          code: (err as { code?: string }).code,
        });
      }
    }

    res.status(failed.length === 0 ? 201 : 207).json({ succeeded, failed });
  },
);

export default router;
