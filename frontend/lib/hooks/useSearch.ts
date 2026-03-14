// frontend/lib/hooks/useSearch.ts

import { useQuery } from '@tanstack/react-query';
import api from '../api';
import type { 
  ContributionQueryResponse,
  Contribution,
  DocumentVersion
} from '../../types/api';

// ==========================================
// TYPES & INTERFACES (US-09 / US-10 Alignment)
// ==========================================

export interface SearchResultItem {
  document_version_id: string;
  title: string;
  teacher_name?: string;
  is_official: boolean;
  quality_score: number;
  snippet: string;
  rrf_score: number;
}

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
  // If no query and no filters exist, return empty to save unnecessary backend hits
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
// TANSTACK QUERY HOOKS (v5 Syntax)
// ==========================================

/**
 * Hook for US-09 Hybrid Search Engine (MeiliSearch + pgvector RRF).
 * Returns highlighted snippets, quality scores, and official teacher flags.
 */
export const useHybridSearch = (params: HybridSearchParams) => {
  return useQuery({
    // QueryKey dynamically reacts to all filter changes
    queryKey: ['hybridSearch', params],
    queryFn: () => fetchHybridSearch(params),
    // Only fire if there is an active search intent (query or explicit filter)
    enabled: !!params.q || !!params.niveau || !!params.type_cours || !!params.filiere,
    staleTime: 5 * 60 * 1000, // Cache results for 5 minutes for snappy UI navigation
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