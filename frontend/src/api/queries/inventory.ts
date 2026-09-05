import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

// ── Types ──────────────────────────────────────────────────────────────────

export interface StockItem {
  id: string;
  sku: string;
  name: string;
  barcode: string;
  locationId: string;
  locationCode: string;
  quantity: number;
  unitOfMeasure: string;
  lastCountedAt: string | null;
  expiryDate: string | null;
}

export interface Location {
  id: string;
  code: string;
  zone: string;
  aisle: string;
  rack: string;
  level: string;
  capacity: number;
  currentLoad: number;
}

export interface StockOnHandFilters {
  sku?: string;
  locationId?: string;
  zone?: string;
  lowStock?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Query keys ─────────────────────────────────────────────────────────────

export const inventoryKeys = {
  all: ['inventory'] as const,
  stockOnHand: (filters?: StockOnHandFilters) =>
    [...inventoryKeys.all, 'stock', filters] as const,
  item: (sku: string) => [...inventoryKeys.all, 'item', sku] as const,
  locations: () => [...inventoryKeys.all, 'locations'] as const,
  location: (id: string) => [...inventoryKeys.all, 'location', id] as const,
  barcodeSearch: (barcode: string) =>
    [...inventoryKeys.all, 'barcode', barcode] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useStockOnHand(filters: StockOnHandFilters = {}) {
  return useQuery({
    queryKey: inventoryKeys.stockOnHand(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.sku) params.set('sku', filters.sku);
      if (filters.locationId) params.set('locationId', filters.locationId);
      if (filters.zone) params.set('zone', filters.zone);
      if (filters.lowStock) params.set('lowStock', 'true');
      if (filters.page) params.set('page', String(filters.page));
      if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
      const qs = params.toString();
      return apiClient<PaginatedResponse<StockItem>>(
        `/inventory/stock${qs ? `?${qs}` : ''}`,
      );
    },
    staleTime: 30_000,
  });
}

export function useItemByBarcode(barcode: string, enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.barcodeSearch(barcode),
    queryFn: () =>
      apiClient<StockItem | null>(`/inventory/barcode/${encodeURIComponent(barcode)}`),
    enabled: enabled && barcode.length > 0,
    staleTime: 60_000,
  });
}

export function useLocations() {
  return useQuery({
    queryKey: inventoryKeys.locations(),
    queryFn: () => apiClient<Location[]>('/inventory/locations'),
    staleTime: 5 * 60_000,
  });
}

export function useLocation(locationId: string) {
  return useQuery({
    queryKey: inventoryKeys.location(locationId),
    queryFn: () => apiClient<Location>(`/inventory/locations/${locationId}`),
    enabled: locationId.length > 0,
    staleTime: 60_000,
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      sku: string;
      locationId: string;
      quantityDelta: number;
      reason: string;
      reference?: string;
    }) => apiClient('/inventory/adjustments', { method: 'POST', body: payload }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}
