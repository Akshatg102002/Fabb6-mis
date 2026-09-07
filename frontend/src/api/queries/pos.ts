import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export type POStatus = 'draft' | 'confirmed' | 'partial' | 'received' | 'cancelled';

export interface POLine {
  id: string;
  po_id: string;
  sku_id: string;
  ordered_qty: number;
  received_qty: number;
  unit_cost: string | null;
  line_number: number;
}

export interface PurchaseOrder {
  id: string;
  supplier_id: string;
  site_id: string;
  po_number: string;
  status: POStatus;
  expected_date: string | null;
  total_value: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  lines?: POLine[];
}

interface POListResponse {
  data: PurchaseOrder[];
  meta: { page: number; limit: number; total: number; pages: number };
}

export const poKeys = {
  all: ['purchase-orders'] as const,
  list: (status?: string) => [...poKeys.all, 'list', status] as const,
  detail: (id: string) => [...poKeys.all, id] as const,
};

export function usePOList(status?: POStatus) {
  return useQuery({
    queryKey: poKeys.list(status),
    queryFn: () => {
      const qs = status ? `?status=${status}&limit=50` : '?limit=50';
      return apiClient<POListResponse>(`/purchase-orders${qs}`);
    },
    staleTime: 20_000,
  });
}

export function usePO(id: string) {
  return useQuery({
    queryKey: poKeys.detail(id),
    queryFn: () => apiClient<PurchaseOrder>(`/purchase-orders/${id}`),
    enabled: id.length > 0,
    staleTime: 15_000,
  });
}

export interface CreatePOPayload {
  supplier_id: string;
  site_id: string;
  po_number: string;
  expected_date?: string;
  notes?: string;
  lines: {
    sku_id: string;
    ordered_qty: number;
    unit_cost?: number;
    line_number: number;
  }[];
}

export function useCreatePO() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePOPayload) =>
      apiClient<PurchaseOrder>('/purchase-orders', { method: 'POST', body: payload }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: poKeys.all });
    },
  });
}
