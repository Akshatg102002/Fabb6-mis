import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

// ── Types ──────────────────────────────────────────────────────────────────

export interface StockOnHandItem {
  id: string;
  skuCode: string;
  skuName: string;
  batch: string | null;
  locationCode: string;
  locationId: string;
  qty: number;
  uom: string;
  expiryDate: string | null;
  costPrice: number | null;
  value: number | null;
  siteId: string;
}

export interface StockOnHandFilters {
  siteId?: string;
  skuSearch?: string;
  locationId?: string;
  expiryBucket?: 'expired' | 'lt30' | 'lt60' | 'gt60';
  page?: number;
  pageSize?: number;
}

export interface PaginatedStockOnHand {
  items: StockOnHandItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ExpiryDashboardRow {
  skuCode: string;
  skuName: string;
  batch: string;
  expiryDate: string;
  daysRemaining: number;
  qty: number;
  locationCode: string;
}

export interface StockMovement {
  id: string;
  skuCode: string;
  skuName: string;
  fromLocationCode: string | null;
  toLocationCode: string | null;
  qty: number;
  movementType: 'inward' | 'putaway' | 'pick' | 'return' | 'adjustment' | 'transfer';
  reference: string | null;
  createdAt: string;
  createdBy: string;
}

export interface MovementFilters {
  skuCode?: string;
  locationId?: string;
  movementType?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedMovements {
  items: StockMovement[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Query keys ─────────────────────────────────────────────────────────────

export const stockKeys = {
  all: ['stock'] as const,
  onHand: (filters?: StockOnHandFilters) => [...stockKeys.all, 'on-hand', filters] as const,
  expiry: (siteId?: string) => [...stockKeys.all, 'expiry', siteId] as const,
  movements: (filters?: MovementFilters) => [...stockKeys.all, 'movements', filters] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useStockOnHand(filters: StockOnHandFilters = {}) {
  return useQuery({
    queryKey: stockKeys.onHand(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.siteId) params.set('siteId', filters.siteId);
      if (filters.skuSearch) params.set('skuSearch', filters.skuSearch);
      if (filters.locationId) params.set('locationId', filters.locationId);
      if (filters.expiryBucket) params.set('expiryBucket', filters.expiryBucket);
      if (filters.page) params.set('page', String(filters.page));
      if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
      const qs = params.toString();
      return apiClient<PaginatedStockOnHand>(`/stock/on-hand${qs ? `?${qs}` : ''}`);
    },
    staleTime: 30_000,
  });
}

export function useExpiryDashboard(siteId?: string) {
  return useQuery({
    queryKey: stockKeys.expiry(siteId),
    queryFn: () => {
      const qs = siteId ? `?siteId=${encodeURIComponent(siteId)}` : '';
      return apiClient<ExpiryDashboardRow[]>(`/stock/expiry${qs}`);
    },
    staleTime: 60_000,
  });
}

export function useStockMovements(filters: MovementFilters = {}) {
  return useQuery({
    queryKey: stockKeys.movements(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.skuCode) params.set('skuCode', filters.skuCode);
      if (filters.locationId) params.set('locationId', filters.locationId);
      if (filters.movementType) params.set('movementType', filters.movementType);
      if (filters.fromDate) params.set('fromDate', filters.fromDate);
      if (filters.toDate) params.set('toDate', filters.toDate);
      if (filters.page) params.set('page', String(filters.page));
      if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
      const qs = params.toString();
      return apiClient<PaginatedMovements>(`/stock/movements${qs ? `?${qs}` : ''}`);
    },
    staleTime: 30_000,
  });
}
