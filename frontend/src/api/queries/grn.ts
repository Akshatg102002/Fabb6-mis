import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

// ── Types ──────────────────────────────────────────────────────────────────

export type GRNStatus = 'draft' | 'open' | 'partial' | 'complete' | 'closed';

export interface GRNLine {
  id: string;
  grnId: string;
  sku: string;
  skuName: string;
  barcode: string;
  expectedQty: number;
  receivedQty: number;
  uom: string;
  status: 'pending' | 'partial' | 'complete' | 'over';
}

export interface GRN {
  id: string;
  reference: string;
  supplierId: string;
  supplierName: string;
  status: GRNStatus;
  createdAt: string;
  expectedAt: string | null;
  receivedAt: string | null;
  lines: GRNLine[];
}

// ── Query keys ─────────────────────────────────────────────────────────────

export const grnKeys = {
  all: ['grn'] as const,
  list: (status?: GRNStatus) => [...grnKeys.all, 'list', status] as const,
  detail: (id: string) => [...grnKeys.all, id] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useGRNList(status?: GRNStatus) {
  return useQuery({
    queryKey: grnKeys.list(status),
    queryFn: () => {
      const qs = status ? `?status=${status}` : '';
      return apiClient<GRN[]>(`/grn${qs}`);
    },
    staleTime: 15_000,
  });
}

export function useGRN(id: string) {
  return useQuery({
    queryKey: grnKeys.detail(id),
    queryFn: () => apiClient<GRN>(`/grn/${id}`),
    enabled: id.length > 0,
    staleTime: 10_000,
  });
}

export function useReceiveItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      grnId: string;
      lineId: string;
      barcode: string;
      qty: number;
      locationId: string;
    }) => apiClient('/grn/receive', { method: 'POST', body: payload }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: grnKeys.detail(vars.grnId) });
      void qc.invalidateQueries({ queryKey: grnKeys.list() });
    },
  });
}
