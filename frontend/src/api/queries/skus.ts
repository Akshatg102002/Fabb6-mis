import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Sku {
  id: string;
  code: string;
  name: string;
  description: string | null;
  barcode: string;
  uom: string;
  weight: number | null;
  volume: number | null;
  category: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SkuFilters {
  search?: string;
  category?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateSkuPayload {
  code: string;
  name: string;
  description?: string;
  barcode: string;
  uom: string;
  weight?: number;
  volume?: number;
  category?: string;
}

export interface GtinLookupResult {
  barcode: string;
  skuId: string | null;
  skuCode: string | null;
  skuName: string | null;
  found: boolean;
}

export interface PaginatedSkus {
  items: Sku[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Query keys ─────────────────────────────────────────────────────────────

export const skuKeys = {
  all: ['skus'] as const,
  list: (filters?: SkuFilters) => [...skuKeys.all, 'list', filters] as const,
  detail: (id: string) => [...skuKeys.all, id] as const,
  gtinLookup: (barcode: string) => [...skuKeys.all, 'gtin', barcode] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useSkus(filters: SkuFilters = {}) {
  return useQuery({
    queryKey: skuKeys.list(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.category) params.set('category', filters.category);
      if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive));
      if (filters.page) params.set('page', String(filters.page));
      if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
      const qs = params.toString();
      return apiClient<PaginatedSkus>(`/skus${qs ? `?${qs}` : ''}`);
    },
    staleTime: 60_000,
  });
}

export function useSku(id: string) {
  return useQuery({
    queryKey: skuKeys.detail(id),
    queryFn: () => apiClient<Sku>(`/skus/${id}`),
    enabled: id.length > 0,
    staleTime: 60_000,
  });
}

export function useCreateSku() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSkuPayload) =>
      apiClient<Sku>('/skus', { method: 'POST', body: payload }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: skuKeys.all });
    },
  });
}

export function useGtinLookup(barcode: string) {
  return useQuery({
    queryKey: skuKeys.gtinLookup(barcode),
    queryFn: () =>
      apiClient<GtinLookupResult>(`/gtins/lookup?barcode=${encodeURIComponent(barcode)}`),
    enabled: barcode.length >= 6,
    staleTime: 5 * 60_000,
  });
}
