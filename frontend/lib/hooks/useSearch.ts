// frontend/lib/hooks/useSearch.ts

import { useQuery } from '@tanstack/react-query';
import api from '../api';
import type { 
  SemanticSearchResult, 
  TextSearchResponse, 
  ContributionQueryResponse,
  Contribution,
  DocumentVersion
} from '../../types/api';

// ==========================================
// AXIOS SERVICE CALLS
// ==========================================

export const fetchSemanticSearch = async (
  query: string, 
  top_k: number = 10,
  filters?: { filiere?: string; niveau?: string; annee?: string }
): Promise<SemanticSearchResult[]> => {
  if (!query) return [];
  const response = await api.get<SemanticSearchResult[]>('/search', {
    params: { query, top_k, ...filters } // FIXED: Dynamically spread any active filters into the query params
  });
  return response.data;
};

export const fetchTextSearch = async (q: string, limit: number = 20, offset: number = 0): Promise<TextSearchResponse> => {
  if (!q) return { items: [], meta: { total: 0, limit, offset } };
  const response = await api.get<TextSearchResponse>('/search/text', {
    params: { q, limit, offset }
  });
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
 * Hook for pgvector-powered Semantic Search.
 * Ideal for Natural Language queries (e.g., "how does binary search work").
 */
export const useSemanticSearch = (
  query: string, 
  top_k: number = 10,
  filters?: { filiere?: string; niveau?: string; annee?: string }
) => {
  return useQuery({
    // FIXED: Added filters to the queryKey so it refetches when filters change
    queryKey: ['semanticSearch', query, top_k, filters],
    queryFn: () => fetchSemanticSearch(query, top_k, filters),
    // Only fire the query if the string has more than 2 characters
    enabled: !!query && query.length > 2,
    staleTime: 5 * 60 * 1000, // Cache results for 5 minutes
  });
};

/**
 * Hook for Full-Text Exact Match Search.
 * Ideal for finding specific document titles or precise keywords.
 */
export const useTextSearch = (q: string, limit: number = 20, offset: number = 0) => {
  return useQuery({
    queryKey: ['textSearch', q, limit, offset],
    queryFn: () => fetchTextSearch(q, limit, offset),
    enabled: !!q && q.length > 2,
    staleTime: 5 * 60 * 1000,
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
 * Crucial for US-12 (Versioning & Archives).
 */
export const useContributionVersions = (id: string | null) => {
  return useQuery({
    queryKey: ['contributionVersions', id],
    queryFn: () => fetchContributionVersions(id as string),
    enabled: !!id,
  });
};