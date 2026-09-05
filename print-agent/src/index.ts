import net from 'net';
import pino from 'pino';

const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000';
const TOKEN = process.env.PRINT_AGENT_TOKEN ?? '';
const PRINTER_HOST = process.env.PRINTER_HOST ?? '127.0.0.1';
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT ?? '9100', 10);
const POLL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '2000', 10);

interface PrintJob {
  id: string;
  zpl: string;
  copies: number;
  label_type: 'bin' | 'batch' | 'tote' | 'carton';
}

async function fetchPendingJobs(): Promise<PrintJob[]> {
  const res = await fetch(`${BACKEND_URL}/api/print-jobs/pending`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const data = await res.json() as { jobs: PrintJob[] };
  return data.jobs;
}

async function ackJob(id: string, success: boolean, error?: string): Promise<void> {
  await fetch(`${BACKEND_URL}/api/print-jobs/${id}/ack`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ success, error }),
    signal: AbortSignal.timeout(5000),
  });
}

function sendZpl(zpl: string, copies: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    const timeout = setTimeout(() => {
      sock.destroy();
      reject(new Error('Print socket timeout'));
    }, 10_000);

    sock.connect(PRINTER_PORT, PRINTER_HOST, () => {
      const payload = zpl.repeat(copies);
      sock.write(payload, 'utf8', () => {
        clearTimeout(timeout);
        sock.end();
        resolve();
      });
    });

    sock.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function processPendingJobs(): Promise<void> {
  let jobs: PrintJob[];
  try {
    jobs = await fetchPendingJobs();
  } catch (err) {
    log.warn({ err }, 'Failed to fetch print jobs — will retry');
    return;
  }

  for (const job of jobs) {
    log.info({ id: job.id, label_type: job.label_type }, 'Printing job');
    try {
      await sendZpl(job.zpl, job.copies ?? 1);
      await ackJob(job.id, true);
      log.info({ id: job.id }, 'Job printed OK');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ id: job.id, err }, 'Print failed');
      await ackJob(job.id, false, msg).catch(() => {});
    }
  }
}

async function main(): Promise<void> {
  log.info({ BACKEND_URL, PRINTER_HOST, PRINTER_PORT, POLL_MS }, 'Print agent starting');

  // Health check: confirm we can reach the backend
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Backend health ${res.status}`);
    log.info('Backend reachable');
  } catch (err) {
    log.error({ err }, 'Backend unreachable at startup — will keep retrying');
  }

  const poll = async (): Promise<void> => {
    await processPendingJobs().catch((err) => log.error({ err }, 'Unexpected error in poll'));
    setTimeout(poll, POLL_MS);
  };

  poll();
}

main().catch((err) => {
  log.fatal({ err }, 'Fatal error');
  process.exit(1);
});
