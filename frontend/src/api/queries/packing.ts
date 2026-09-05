import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export type PackStatus = 'waiting' | 'in_progress' | 'packed' | 'dispatched';

export interface PackItem {
  id: string;
  orderId: string;
  sku: string;
  skuName: string;
  barcode: string;
  qty: number;
  uom: string;
  packedQty: number;
  status: 'pending' | 'packed';
}

export interface PackOrder {
  id: string;
  orderRef: string;
  customerId: string;
  customerName: string;
  status: PackStatus;
  priority: 'normal' | 'urgent' | 'same_day';
  dueAt: string | null;
  assignedTo: string | null;
  items: PackItem[];
  cartonId: string | null;
  shippingLabel: string | null;
}

export const packingKeys = {
  all: ['packing'] as const,
  queue: () => [...packingKeys.all, 'queue'] as const,
  order: (id: string) => [...packingKeys.all, id] as const,
};

export function usePackingQueue() {
  return useQuery({
    queryKey: packingKeys.queue(),
    queryFn: () => apiClient<PackOrder[]>('/packing?status=waiting,in_progress'),
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

export function usePackOrder(orderId: string) {
  return useQuery({
    queryKey: packingKeys.order(orderId),
    queryFn: () => apiClient<PackOrder>(`/packing/${orderId}`),
    enabled: orderId.length > 0,
    staleTime: 10_000,
  });
}

export function useScanPackItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      orderId: string;
      barcode: string;
      qty: number;
    }) => apiClient('/packing/scan', { method: 'POST', body: payload }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: packingKeys.order(vars.orderId) });
    },
  });
}

export function useCloseCarton() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { orderId: string; cartonRef: string }) =>
      apiClient('/packing/close', { method: 'POST', body: payload }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: packingKeys.order(vars.orderId) });
      void qc.invalidateQueries({ queryKey: packingKeys.queue() });
    },
  });
}
