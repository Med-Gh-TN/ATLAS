// frontend/lib/hooks/useSearch.ts

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '../api';
import type { 
  ContributionQueryResponse,
  Contribution,
  DocumentVersion,
  SearchResultItem // US-09: Imported from central types to prevent drift
} from '../../types/api';

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface HybridSearchParams {
  q?: string;
  filiere?: string;
  niveau?: string;
  annee?: string;
  type_cours?: string;
  langue?: string;
  is_official?: boolean;
  top_k?: number;
}

// ==========================================
// AXIOS SERVICE CALLS
// ==========================================

export const fetchHybridSearch = async (params: HybridSearchParams): Promise<SearchResultItem[]> => {
  // Defensive Architecture: Block empty generic queries from hitting the backend
  if (!params.q && !params.niveau && !params.filiere && !params.type_cours) {
    return [];
  }
  
  const response = await api.get<SearchResultItem[]>('/search', { params });
  return response.data;
};

export const fetchFilteredContributions = async (
  params: {
    limit?: number;
    offset?: number;
    status?: string;
    uploader_id?: string;
    sort_by?: string;
    order?: string;
  }
): Promise<ContributionQueryResponse> => {
  const response = await api.get<ContributionQueryResponse>('/contributions/query', { params });
  return response.data;
};

export const fetchContributionById = async (id: string): Promise<Contribution> => {
  const response = await api.get<Contribution>(`/contributions/${id}`);
  return response.data;
};

export const fetchContributionVersions = async (id: string): Promise<DocumentVersion[]> => {
  const response = await api.get<DocumentVersion[]>(`/contributions/${id}/versions`);
  return response.data;
};

// ==========================================
// STATE MANAGEMENT HOOKS (US-10)
// ==========================================

/**
 * US-10: Treats the URL as the Single Source of Truth for search state.
 * Enables deep-linking, history persistence, and predictable hydration.
 */
export const useSearchState = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentParams = useMemo<HybridSearchParams>(() => {
    return {
      q: searchParams.get('q') || '',
      filiere: searchParams.get('filiere') || undefined,
      niveau: searchParams.get('niveau') || undefined,
      annee: searchParams.get('annee') || undefined,
      type_cours: searchParams.get('type_cours') || undefined,
      langue: searchParams.get('langue') || undefined,
      is_official: searchParams.get('is_official') === 'true' ? true : undefined,
    };
  }, [searchParams]);

  const updateParams = useCallback((newParams: Partial<HybridSearchParams>, replace = false) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(newParams).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });

    const queryString = params.toString();
    const targetUrl = queryString ? `${pathname}?${queryString}` : pathname;

    if (replace) {
      router.replace(targetUrl, { scroll: false });
    } else {
      router.push(targetUrl, { scroll: false });
    }
  }, [searchParams, pathname, router]);

  return { currentParams, updateParams };
};

// ==========================================
// TANSTACK QUERY HOOKS (v5 Syntax)
// ==========================================

/**
 * Hook for US-09 Hybrid Search Engine (MeiliSearch + pgvector RRF).
 * Returns highlighted snippets, quality scores, and official teacher flags.
 */
export const useHybridSearch = (params: HybridSearchParams) => {
  return useQuery({
    queryKey: ['hybridSearch', params],
    queryFn: () => fetchHybridSearch(params),
    // Only fire if there is an active search intent (query or explicit filter)
    enabled: !!params.q || !!params.niveau || !!params.type_cours || !!params.filiere,
    staleTime: 5 * 60 * 1000, // Cache results for 5 minutes for snappy UI navigation
  });
};

/**
 * US-10: Isolated hook strictly for real-time autocomplete suggestions.
 * Bypasses long caching to ensure immediate feedback on typo corrections.
 */
export const useSearchAutocomplete = (debouncedQuery: string) => {
  return useQuery({
    queryKey: ['autocomplete', debouncedQuery],
    queryFn: () => fetchHybridSearch({ q: debouncedQuery, top_k: 5 }),
    // Require at least 2 characters to prevent massive unspecific queries
    enabled: debouncedQuery.length >= 2,
    staleTime: 0, 
  });
};

/**
 * Hook for retrieving a paginated/filtered list of contributions.
 * Used for the Admin Moderation Panel and "Mes Cours" dashboards.
 */
export const useFilteredContributions = (
  params: Parameters<typeof fetchFilteredContributions>[0],
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: ['contributions', params],
    queryFn: () => fetchFilteredContributions(params),
    enabled,
    staleTime: 60 * 1000, // 1 minute to keep dashboard relatively fresh
  });
};

/**
 * Hook to fetch the root metadata of a specific contribution.
 */
export const useContribution = (id: string | null) => {
  return useQuery({
    queryKey: ['contribution', id],
    queryFn: () => fetchContributionById(id as string),
    enabled: !!id,
  });
};

/**
 * Hook to fetch all iterations (versions) of a specific document.
 * Crucial for US-12 (Versioning & Archives) and RAG instantiation.
 */
export const useContributionVersions = (id: string | null) => {
  return useQuery({
    queryKey: ['contributionVersions', id],
    queryFn: () => fetchContributionVersions(id as string),
    enabled: !!id,
  });
};