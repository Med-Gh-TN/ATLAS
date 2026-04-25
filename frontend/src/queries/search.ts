import { useQuery } from "@tanstack/react-query";
import { searchApi } from "@/lib/api";
import type { SearchParams } from "@/types/api.types";

export function useSearchQuery(params: SearchParams) {
  return useQuery({
    queryKey: ["search", params],
    queryFn: () => searchApi.hybrid(params),
    enabled: Boolean(params.q || params.filiere || params.niveau),
    staleTime: 2 * 60 * 1000,
  });
}

export function useSearchAutocompleteQuery(query: string) {
  return useQuery({
    queryKey: ["search", "autocomplete", query],
    queryFn: () => searchApi.autocomplete(query),
    enabled: query.length >= 2,
    staleTime: 2 * 60 * 1000,
  });
}
