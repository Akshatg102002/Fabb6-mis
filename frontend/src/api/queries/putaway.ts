import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export type PutawayStatus = 'pending' | 'in_progress' | 'complete';

export interface PutawayTask {
  id: string;
  grnId: string;
  grnReference: string;
  sku: string;
  skuName: string;
  barcode: string;
  quantity: number;
  uom: string;
  suggestedLocationId: string;
  suggestedLocationCode: string;
  assignedTo: string | null;
  status: PutawayStatus;
  createdAt: string;
}

export const putawayKeys = {
  all: ['putaway'] as const,
  pending: () => [...putawayKeys.all, 'pending'] as const,
  detail: (id: string) => [...putawayKeys.all, id] as const,
};

export function usePendingPutaway() {
  return useQuery({
    queryKey: putawayKeys.pending(),
    queryFn: () => apiClient<PutawayTask[]>('/putaway?status=pending'),
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

export function usePutawayTask(id: string) {
  return useQuery({
    queryKey: putawayKeys.detail(id),
    queryFn: () => apiClient<PutawayTask>(`/putaway/${id}`),
    enabled: id.length > 0,
    staleTime: 10_000,
  });
}

export function useCompletePutaway() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      taskId: string;
      locationId: string;
      locationBarcode: string;
      qty: number;
    }) => apiClient('/putaway/complete', { method: 'POST', body: payload }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: putawayKeys.all });
    },
  });
}
