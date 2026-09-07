import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

interface Site {
  id: string;
  name: string;
  is_active: boolean;
}

// Returns the ID of the first (and only) active warehouse site.
// All forms use this instead of showing a site dropdown.
export function useSingleSite() {
  const { data } = useQuery<Site[]>({
    queryKey: ['sites'],
    queryFn: () => apiClient<Site[]>('/locations/sites'),
    staleTime: 5 * 60_000,
  });
  const active = data?.find((s) => s.is_active) ?? data?.[0];
  return { siteId: active?.id ?? null, siteName: active?.name ?? null };
}
