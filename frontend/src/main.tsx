import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/tokens.css';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found in index.html');

// Add this block at the top of main.tsx, before createRoot(...)
async function enableMocking() {
  if (import.meta.env.VITE_MOCK !== 'true') return;
  const { worker } = await import('./mocks/browser');
  return worker.start({ onUnhandledRequest: 'bypass' });
}

enableMocking().then(() => {
  createRoot(root!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register service worker (vite-plugin-pwa generates this file during build)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('SW registration failed:', err));
  });
}
