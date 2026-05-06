import { useQuery } from "@tanstack/react-query";
import { searchApi } from "@/lib/api";
import type { SearchParams } from "@/types/api.types";

/** Mirrors backend: need q (≥2 chars) or at least one filter. */
export function isSearchQueryEnabled(params: SearchParams): boolean {
  const q = params.q?.trim() ?? "";
  return Boolean(
    (q.length >= 2) ||
      params.filiere ||
      params.niveau ||
      params.type ||
      params.annee != null ||
      params.langue,
  );
}

export function useSearchQuery(params: SearchParams) {
  return useQuery({
    queryKey: ["search", params],
    queryFn: () => searchApi.hybrid(params),
    enabled: isSearchQueryEnabled(params),
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
