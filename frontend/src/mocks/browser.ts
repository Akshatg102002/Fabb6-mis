// ─── Fabb6 WMS — MSW Browser Worker ─────────────────────────────────────
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
