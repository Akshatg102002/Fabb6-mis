import { Router } from 'express';
import authRouter from './auth.js';
import skusRouter from './skus.js';
import gtinsRouter from './gtins.js';
import locationsRouter from './locations.js';
import grnRouter from './grn.js';
import putawayRouter from './putaway.js';
import stockRouter from './stock.js';
import pickingRouter from './picking.js';
import packingRouter from './packing.js';
import returnsRouter from './returns.js';
import countingRouter from './counting.js';
import adjustmentsRouter from './adjustments.js';
import transfersRouter from './transfers.js';
import reportsRouter from './reports.js';
import printJobsRouter from './print-jobs.js';

const router = Router();

// Auth
router.use('/auth', authRouter);

// Catalogue
router.use('/skus', skusRouter);
router.use('/gtins', gtinsRouter);

// Locations & sites
router.use('/locations', locationsRouter);

// GRN router exposes: /grns/*, /purchase-orders/*
router.use('/', grnRouter);

// Putaway
router.use('/putaway', putawayRouter);

// Stock
router.use('/stock', stockRouter);

// Picking
router.use('/picking', pickingRouter);

// Packing
router.use('/packing', packingRouter);

// Returns
router.use('/returns', returnsRouter);

// Cycle counts
router.use('/counting', countingRouter);

// Adjustments
router.use('/adjustments', adjustmentsRouter);

// Transfers
router.use('/transfers', transfersRouter);

// Reports
router.use('/reports', reportsRouter);

// Print jobs
router.use('/print-jobs', printJobsRouter);

export default router;
