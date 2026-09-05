import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSessionStore } from '@/stores/sessionStore';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { ToastProvider } from '@/components/toast/ToastProvider';

// Eagerly loaded pages
import Login from '@/pages/Login';

// Lazily loaded pages (code-split per route)
const Home = lazy(() => import('@/pages/Home'));
const GRN = lazy(() => import('@/pages/inward/GRN'));
const ReceiveItem = lazy(() => import('@/pages/inward/ReceiveItem'));
const Putaway = lazy(() => import('@/pages/putaway/Putaway'));
const PickList = lazy(() => import('@/pages/picking/PickList'));
const PackOrder = lazy(() => import('@/pages/packing/PackOrder'));
const CycleCount = lazy(() => import('@/pages/counting/CycleCount'));
const ReturnInward = lazy(() => import('@/pages/returns/ReturnInward'));
const StockOnHand = lazy(() => import('@/pages/stock/StockOnHand'));
const Settings = lazy(() => import('@/pages/settings/Settings'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      gcTime: 5 * 60_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

function PageFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        backgroundColor: 'var(--surface-sunken)',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          border: '4px solid var(--brand-primary)',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/** Redirect unauthenticated users to /login */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Bootstrap the offline queue sync loop inside the authenticated tree */
function OfflineQueueBootstrap({ children }: { children: React.ReactNode }) {
  useOfflineQueue(); // side-effect: registers online/offline listeners and periodic sync
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />

            {/* Protected */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <OfflineQueueBootstrap>
                    <Routes>
                      <Route path="/" element={<Navigate to="/home" replace />} />
                      <Route path="/home" element={<Home />} />

                      {/* Inward */}
                      <Route path="/inward" element={<GRN />} />
                      <Route path="/inward/receive/:grnId" element={<ReceiveItem />} />

                      {/* Putaway */}
                      <Route path="/putaway" element={<Putaway />} />

                      {/* Picking */}
                      <Route path="/pick" element={<PickList />} />
                      <Route path="/pick/:listId" element={<PickList />} />
                      <Route path="/picking" element={<PickList />} />
                      <Route path="/picking/:listId" element={<PickList />} />

                      {/* Packing */}
                      <Route path="/pack" element={<PackOrder />} />
                      <Route path="/pack/:orderId" element={<PackOrder />} />
                      <Route path="/packing" element={<PackOrder />} />
                      <Route path="/packing/:orderId" element={<PackOrder />} />

                      {/* Counting */}
                      <Route path="/count" element={<CycleCount />} />
                      <Route path="/count/:countId" element={<CycleCount />} />
                      <Route path="/counting" element={<CycleCount />} />
                      <Route path="/counting/:countId" element={<CycleCount />} />

                      {/* Returns */}
                      <Route path="/returns" element={<ReturnInward />} />
                      <Route path="/returns/:returnId" element={<ReturnInward />} />

                      {/* Stock */}
                      <Route path="/stock" element={<StockOnHand />} />

                      {/* Settings */}
                      <Route path="/settings" element={<Settings />} />

                      {/* Reports — placeholder redirect to stock */}
                      <Route path="/reports" element={<Navigate to="/stock" replace />} />

                      {/* Fallback */}
                      <Route path="*" element={<Navigate to="/home" replace />} />
                    </Routes>
                  </OfflineQueueBootstrap>
                </ProtectedRoute>
              }
            />

            {/* Root redirect */}
            <Route path="/" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
