import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

// ── Types ──────────────────────────────────────────────────────────────────

export type PickListStatus = 'assigned' | 'in_progress' | 'partial' | 'complete';

export interface PickLine {
  id: string;
  pickListId: string;
  sku: string;
  skuName: string;
  barcode: string;
  locationId: string;
  locationCode: string;
  requiredQty: number;
  pickedQty: number;
  uom: string;
  sortOrder: number;
  status: 'pending' | 'picked' | 'short';
}

export interface PickList {
  id: string;
  reference: string;
  orderId: string;
  orderRef: string;
  assignedTo: string | null;
  status: PickListStatus;
  createdAt: string;
  dueAt: string | null;
  lines: PickLine[];
}

// ── Query keys ─────────────────────────────────────────────────────────────

export const pickingKeys = {
  all: ['picking'] as const,
  myLists: (userId: string) => [...pickingKeys.all, 'my', userId] as const,
  detail: (id: string) => [...pickingKeys.all, id] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useMyPickLists(userId: string) {
  return useQuery({
    queryKey: pickingKeys.myLists(userId),
    queryFn: () => apiClient<PickList[]>(`/picking?assignedTo=${userId}`),
    enabled: userId.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function usePickList(id: string) {
  return useQuery({
    queryKey: pickingKeys.detail(id),
    queryFn: () => apiClient<PickList>(`/picking/${id}`),
    enabled: id.length > 0,
    staleTime: 10_000,
  });
}

export function useConfirmPick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      pickListId: string;
      lineId: string;
      barcode: string;
      pickedQty: number;
      locationId: string;
    }) => apiClient('/picking/confirm', { method: 'POST', body: payload }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: pickingKeys.detail(vars.pickListId) });
    },
  });
}

export function useShortPick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      pickListId: string;
      lineId: string;
      reason: string;
    }) => apiClient('/picking/short', { method: 'POST', body: payload }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: pickingKeys.detail(vars.pickListId) });
    },
  });
}
