import express, {
  type Request,
  type Response,
  type NextFunction,
  type ErrorRequestHandler,
} from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import http from 'http';
import { logger } from './logger.js';
import { checkDbConnection, closeDb } from './db/index.js';
import { startJobQueue, stopJobQueue } from './jobs/index.js';
import routes from './routes/index.js';

// Re-export logger for backwards compatibility
export { logger };

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express();

// Security headers
app.use(helmet());

// Gzip compression
app.use(compression() as unknown as express.RequestHandler);

// Trust proxy for accurate IPs behind load balancer
app.set('trust proxy', parseInt(process.env['TRUST_PROXY'] ?? '1', 10));

// HTTP request logging
app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req: http.IncomingMessage, res: http.ServerResponse, err?: Error) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req: Record<string, unknown>) => ({
        id: req['id'],
        method: req['method'],
        url: req['url'],
        remoteAddress: req['remoteAddress'],
      }),
      res: (res: Record<string, unknown>) => ({ statusCode: res['statusCode'] }),
    },
  }),
);

// Rate limiting
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: parseInt(process.env['RATE_LIMIT_RPM'] ?? '300', 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
    skip: (req) => req.path === '/health',
  }),
);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await checkDbConnection();
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

app.get('/ready', async (_req, res) => {
  try {
    await checkDbConnection();
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not ready' });
  }
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/v1', routes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Global error handler (Express 5 propagates async errors automatically) ──
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = (err as { status?: number; statusCode?: number }).status
    ?? (err as { status?: number; statusCode?: number }).statusCode
    ?? 500;
  const message = status < 500 ? (err as Error).message : 'Internal server error';

  if (status >= 500) {
    logger.error({ err }, 'Unhandled error');
  } else {
    logger.warn({ err }, 'Client error');
  }

  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
};

app.use(errorHandler);

// ─── Graceful shutdown ────────────────────────────────────────────────────────
let server: http.Server;
let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');

  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      // Stop job queue first (waits for running jobs up to timeout)
      await stopJobQueue();
      logger.info('Job queue drained');
    } catch (err) {
      logger.error({ err }, 'Error stopping job queue');
    }

    try {
      // Close database pool
      await closeDb();
      logger.info('Database pool closed');
    } catch (err) {
      logger.error({ err }, 'Error closing database pool');
    }

    logger.info('Graceful shutdown complete');
    process.exit(0);
  });

  // Force exit after timeout
  const SHUTDOWN_TIMEOUT = parseInt(process.env['SHUTDOWN_TIMEOUT_MS'] ?? '15000', 10);
  setTimeout(() => {
    logger.error('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT).unref();
}

// ─── Startup ──────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  // Validate DB connection before starting
  try {
    await checkDbConnection();
    logger.info('Database connection verified');
  } catch (err) {
    logger.fatal({ err }, 'Cannot connect to database, exiting');
    process.exit(1);
  }

  // Start job queue
  try {
    await startJobQueue();
  } catch (err) {
    logger.error({ err }, 'Failed to start job queue (continuing without it)');
  }

  // Start HTTP server
  server = http.createServer(app);

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.fatal({ port: PORT }, `Port ${PORT} is already in use`);
      process.exit(1);
    }
    logger.error({ err }, 'HTTP server error');
  });

  server.listen(PORT, HOST, () => {
    logger.info(
      { port: PORT, host: HOST, env: process.env['NODE_ENV'] ?? 'development' },
      'Fabb6 MIS backend started',
    );
  });

  // Register shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection');
    shutdown('unhandledRejection');
  });
}

start();

export default app;
