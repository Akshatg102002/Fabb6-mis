import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export type ReturnStatus = 'awaiting' | 'receiving' | 'qc' | 'complete' | 'rejected';
export type ReturnReason =
  | 'damaged'
  | 'wrong_item'
  | 'not_wanted'
  | 'quality_issue'
  | 'other';

export interface ReturnLine {
  id: string;
  returnId: string;
  sku: string;
  skuName: string;
  barcode: string;
  expectedQty: number;
  receivedQty: number;
  reason: ReturnReason;
  condition: 'good' | 'repackage' | 'damage' | 'scrap' | null;
  dispositionLocationId: string | null;
  status: 'pending' | 'received' | 'qc_done';
}

export interface ReturnInward {
  id: string;
  reference: string;
  orderId: string;
  orderRef: string;
  customerId: string;
  customerName: string;
  status: ReturnStatus;
  receivedAt: string | null;
  lines: ReturnLine[];
}

export const returnsKeys = {
  all: ['returns'] as const,
  pending: () => [...returnsKeys.all, 'pending'] as const,
  detail: (id: string) => [...returnsKeys.all, id] as const,
};

export function usePendingReturns() {
  return useQuery({
    queryKey: returnsKeys.pending(),
    queryFn: () => apiClient<ReturnInward[]>('/returns?status=awaiting,receiving'),
    staleTime: 15_000,
  });
}

export function useReturn(id: string) {
  return useQuery({
    queryKey: returnsKeys.detail(id),
    queryFn: () => apiClient<ReturnInward>(`/returns/${id}`),
    enabled: id.length > 0,
    staleTime: 10_000,
  });
}

export function useReceiveReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      returnId: string;
      lineId: string;
      barcode: string;
      qty: number;
      condition: ReturnLine['condition'];
      dispositionLocationId?: string;
    }) => apiClient('/returns/receive', { method: 'POST', body: payload }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: returnsKeys.detail(vars.returnId) });
    },
  });
}
