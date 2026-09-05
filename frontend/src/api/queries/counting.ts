import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export type CycleCountStatus = 'scheduled' | 'in_progress' | 'pending_review' | 'complete';

export interface CycleCountLine {
  id: string;
  countId: string;
  locationId: string;
  locationCode: string;
  sku: string;
  skuName: string;
  barcode: string;
  expectedQty: number;
  countedQty: number | null;
  variance: number | null;
  status: 'pending' | 'counted' | 'discrepancy';
}

export interface CycleCount {
  id: string;
  reference: string;
  zone: string | null;
  status: CycleCountStatus;
  scheduledAt: string;
  completedAt: string | null;
  assignedTo: string | null;
  lines: CycleCountLine[];
}

export const countingKeys = {
  all: ['counting'] as const,
  scheduled: () => [...countingKeys.all, 'scheduled'] as const,
  detail: (id: string) => [...countingKeys.all, id] as const,
};

export function useScheduledCounts() {
  return useQuery({
    queryKey: countingKeys.scheduled(),
    queryFn: () => apiClient<CycleCount[]>('/counts?status=scheduled,in_progress'),
    staleTime: 30_000,
  });
}

export function useCycleCount(id: string) {
  return useQuery({
    queryKey: countingKeys.detail(id),
    queryFn: () => apiClient<CycleCount>(`/counts/${id}`),
    enabled: id.length > 0,
    staleTime: 10_000,
  });
}

export function useSubmitCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      countId: string;
      lineId: string;
      barcode: string;
      countedQty: number;
    }) => apiClient('/counts/submit', { method: 'POST', body: payload }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: countingKeys.detail(vars.countId) });
    },
  });
}
