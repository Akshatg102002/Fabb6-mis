import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface Vendor {
  id: string;
  vendor_code: string | null;
  name: string;
  gstin: string | null;
  city: string | null;
  email: string | null;
  is_active: boolean;
}

export function useVendors() {
  return useQuery({
    queryKey: ['vendors'],
    queryFn: () => apiClient<{ data: Vendor[]; total: number }>('/vendors'),
    staleTime: 60_000,
  });
}

export function useVendor(id: string) {
  return useQuery({
    queryKey: ['vendors', id],
    queryFn: () => apiClient<Vendor>(`/vendors/${id}`),
    enabled: id.length > 0,
    staleTime: 60_000,
  });
}
